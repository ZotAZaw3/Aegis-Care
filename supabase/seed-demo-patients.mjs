// Throwaway generator: builds seed migration for 2-3 demo patients from Synthea CSVs.
// Run: node supabase/seed-demo-patients.mjs
// Streams selected CSVs, filters to chosen PATIENT ids, emits idempotent INSERTs.
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, '..', 'synthea-dental-dataset', 'csv');
const OUT = join(__dirname, 'migrations', '20260718050000_seed_demo_patients.sql');

// Chosen demo patients (see report). All synthea ids are UUIDs.
const PATIENTS = new Set([
  '7fb1293d-2f94-f9c6-9bda-ba3b154fb103', // oral SCC (cancer) — mandatory neo case
  '28db9679-adcd-baef-63fb-68024ced5adf', // dental implant + ACTIVE warfarin + clopidogrel (AFib/MI) — Lane1 anticoagulant
  '06edd1f4-d059-0c45-0886-8f337b4b21b5', // tooth extraction + Penicillin allergy — Lane1 allergy
]);

// --- CSV parsing (quote-aware) ---
function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function readCsv(file, onRow) {
  const rl = createInterface({ input: createReadStream(join(CSV, file), 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) { header = parseLine(line); continue; }
    onRow(parseLine(line), header);
  }
}

// --- SQL helpers ---
const sq = (v) => (v === undefined || v === null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
// date-only: take first 10 chars if timestamp
const dsq = (v) => {
  if (!v) return 'NULL';
  const s = String(v).slice(0, 10);
  return `'${s}'`;
};
const tsq = (v) => (v ? `'${String(v)}'` : 'NULL');
const uuid = (v) => (v ? `'${v}'` : 'NULL');

// --- Collect rows ---
const rows = {
  patients: [], allergies_display: [],
  emr_patients: [], emr_encounters: [], emr_conditions: [], emr_procedures: [],
  emr_medications: [], emr_allergies: [], emr_imaging: [], emr_careplans: [], emr_devices: [],
};

const SEV = { MILD: 'mild', MODERATE: 'moderate', SEVERE: 'severe' };
const sevEnum = (v) => SEV[String(v || '').toUpperCase()] || 'mild';

// Track encounter ids per patient (for children FK) + keep all (52/80/60 encounters — no cap needed)
const encIds = new Set();

async function main() {
  // patients.csv: Id,BIRTHDATE,DEATHDATE,SSN,...,FIRST(8),MIDDLE(9),LAST(10),...,GENDER(16)
  await readCsv('patients.csv', (r) => {
    const id = r[0];
    if (!PATIENTS.has(id)) return;
    const first = r[7], last = r[9];
    const fullName = [first, last].filter(Boolean).join(' ');
    rows.patients.push(`  (${uuid(id)}, ${sq(fullName)}, ${dsq(r[1])}, ${sq(r[15])})`);
    rows.emr_patients.push(`  (${uuid(id)}, ${uuid(id)}, ${dsq(r[1])}, ${sq(r[15])})`);
  });

  // encounters.csv: Id,START,STOP,PATIENT,ORGANIZATION,PROVIDER,PAYER,ENCOUNTERCLASS,CODE,DESCRIPTION
  await readCsv('encounters.csv', (r) => {
    const pid = r[3];
    if (!PATIENTS.has(pid)) return;
    const encId = r[0];
    encIds.add(encId);
    rows.emr_encounters.push(
      `  (${uuid(encId)}, ${uuid(pid)}, ${sq(encId)}, ${sq(r[8])}, ${sq(r[9])}, ${sq(r[7])}, ${tsq(r[1])}, ${tsq(r[2])}, ${sq(r[5])}, ${sq(r[4])})`
    );
  });

  // conditions.csv: START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESCRIPTION
  await readCsv('conditions.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[3]) ? uuid(r[3]) : 'NULL';
    rows.emr_conditions.push(`  (${uuid(pid)}, ${enc}, ${sq(r[5])}, ${sq(r[6])}, ${dsq(r[0])}, ${dsq(r[1])})`);
  });

  // procedures.csv: START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESCRIPTION,...
  await readCsv('procedures.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[3]) ? uuid(r[3]) : 'NULL';
    rows.emr_procedures.push(`  (${uuid(pid)}, ${enc}, ${sq(r[5])}, ${sq(r[6])}, ${tsq(r[0])})`);
  });

  // medications.csv: START,STOP,PATIENT,PAYER,ENCOUNTER,CODE,DESCRIPTION,...
  await readCsv('medications.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[4]) ? uuid(r[4]) : 'NULL';
    // med_stop stays NULL when empty (active drug — Lane1 needs this)
    rows.emr_medications.push(`  (${uuid(pid)}, ${enc}, ${sq(r[5])}, ${sq(r[6])}, ${dsq(r[0])}, ${dsq(r[1])})`);
  });

  // allergies.csv: START,STOP,PATIENT,ENCOUNTER,CODE,SYSTEM,DESCRIPTION,TYPE,CATEGORY,REACTION1,DESCRIPTION1,SEVERITY1,...
  await readCsv('allergies.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const desc = r[6], sev1 = r[11], cat = r[8];
    rows.emr_allergies.push(`  (${uuid(pid)}, ${sq(r[4])}, ${sq(desc)}, ${sq(sev1)})`);
    // clinical-display table: skip generic "Allergic disposition" finding; keep real allergens
    if (desc && !/allergic disposition/i.test(desc)) {
      const note = cat ? `${cat}` : null;
      rows.allergies_display.push(`  (${uuid(pid)}, ${sq(desc)}, '${sevEnum(sev1)}', ${sq(note)})`);
    }
  });

  // imaging_studies.csv: Id,DATE,PATIENT,ENCOUNTER,SERIES_UID,BODYSITE_CODE,BODYSITE_DESCRIPTION,MODALITY_CODE,MODALITY_DESCRIPTION,...
  await readCsv('imaging_studies.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[3]) ? uuid(r[3]) : 'NULL';
    rows.emr_imaging.push(`  (${uuid(pid)}, ${enc}, ${sq(r[8])}, ${sq(r[6])}, ${tsq(r[1])})`);
  });

  // careplans.csv: Id,START,STOP,PATIENT,ENCOUNTER,CODE,DESCRIPTION,...
  await readCsv('careplans.csv', (r) => {
    const pid = r[3];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[4]) ? uuid(r[4]) : 'NULL';
    rows.emr_careplans.push(`  (${uuid(pid)}, ${enc}, ${sq(r[5])}, ${sq(r[6])}, ${dsq(r[1])}, ${dsq(r[2])})`);
  });

  // devices.csv: START,STOP,PATIENT,ENCOUNTER,CODE,DESCRIPTION,UDI
  await readCsv('devices.csv', (r) => {
    const pid = r[2];
    if (!PATIENTS.has(pid)) return;
    const enc = encIds.has(r[3]) ? uuid(r[3]) : 'NULL';
    rows.emr_devices.push(`  (${uuid(pid)}, ${enc}, ${sq(r[4])}, ${sq(r[5])}, ${dsq(r[0])})`);
  });

  writeSql();
}

function insertBlock(sql, table, cols, values) {
  if (!values.length) return;
  sql.push(`INSERT INTO public.${table} (${cols}) VALUES`);
  sql.push(values.join(',\n') + ';');
  sql.push('');
}

function writeSql() {
  const ids = [...PATIENTS].map((i) => `'${i}'`).join(', ');
  const sql = [];
  sql.push('-- Phase 03/04 demo seed: 2-3 rich Synthea patients (hand-picked, replaces full ETL).');
  sql.push('-- Patients: 7fb1293d=oral SCC(cancer) | 28db9679=implant+active warfarin/clopidogrel(AFib) | 06edd1f4=extraction+penicillin allergy.');
  sql.push('-- Idempotent: clears prior rows for these patients, then re-inserts. Synthea UUIDs used as PKs.');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- Clean prior demo rows (children first, then parents via patients CASCADE).');
  for (const t of ['emr_conditions', 'emr_procedures', 'emr_medications', 'emr_allergies',
    'emr_imaging_studies', 'emr_careplans', 'emr_devices', 'emr_encounters', 'emr_patients', 'patient_allergies']) {
    sql.push(`DELETE FROM public.${t} WHERE patient_id IN (${ids});`);
  }
  sql.push(`DELETE FROM public.patients WHERE id IN (${ids});`);
  sql.push('');

  insertBlock(sql, 'patients', 'id, full_name, dob, gender', rows.patients);
  insertBlock(sql, 'emr_patients', 'patient_id, synthea_id, birthdate, gender', rows.emr_patients);
  insertBlock(sql, 'emr_encounters',
    'id, patient_id, synthea_encounter_id, code, description, class, encounter_start, encounter_stop, provider, organization',
    rows.emr_encounters);
  insertBlock(sql, 'emr_conditions', 'patient_id, encounter_id, code, description, onset, abatement', rows.emr_conditions);
  insertBlock(sql, 'emr_procedures', 'patient_id, encounter_id, code, description, performed_at', rows.emr_procedures);
  insertBlock(sql, 'emr_medications', 'patient_id, encounter_id, code, description, med_start, med_stop', rows.emr_medications);
  insertBlock(sql, 'emr_allergies', 'patient_id, code, description, severity', rows.emr_allergies);
  insertBlock(sql, 'emr_imaging_studies', 'patient_id, encounter_id, modality, body_site, study_date', rows.emr_imaging);
  insertBlock(sql, 'emr_careplans', 'patient_id, encounter_id, code, description, cp_start, cp_stop', rows.emr_careplans);
  insertBlock(sql, 'emr_devices', 'patient_id, encounter_id, code, description, device_start', rows.emr_devices);
  insertBlock(sql, 'patient_allergies', 'patient_id, allergen, severity, note', rows.allergies_display);

  sql.push('COMMIT;');
  sql.push('');
  writeFileSync(OUT, sql.join('\n'), 'utf8');

  const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
  console.log('WROTE', OUT);
  console.log(JSON.stringify(counts, null, 2));
}

main();
