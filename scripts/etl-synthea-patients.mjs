// ETL: load 500-1000 dental-rich Synthea patients into Supabase (patients + emr_*).
// Streams CSVs (never loads whole file). Idempotent: delete-then-insert per selected patient.
// Run: node scripts/etl-synthea-patients.mjs --limit 800
//      node scripts/etl-synthea-patients.mjs --ids <uuid,uuid,...>   (re-run subset for idempotency)
// Secrets: SUPABASE_SERVICE_ROLE_KEY from .dev.vars, VITE_SUPABASE_URL from .env. Never logged.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readCsv } from "./etl/csv-stream.mjs";
import { scoreRow, selectTop } from "./etl/patient-ranker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSV = join(ROOT, "data", "synthea-dental-dataset", "csv");

// 3 demo patients that MUST survive (Phase 03/04 seed).
const DEMO_IDS = [
  "7fb1293d-2f94-f9c6-9bda-ba3b154fb103",
  "28db9679-adcd-baef-63fb-68024ced5adf",
  "06edd1f4-d059-0c45-0886-8f337b4b21b5",
];

// --- args ---
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const LIMIT = parseInt(arg("limit", "800"), 10);
const IDS_ARG = arg("ids", "");

// --- env (parse .dev.vars + .env by hand; do not print values) ---
function parseEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* ignore */
  }
  return out;
}
const devVars = parseEnvFile(join(ROOT, ".dev.vars"));
const dotEnv = parseEnvFile(join(ROOT, ".env"));
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || dotEnv.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || devVars.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env / .dev.vars).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// --- value helpers ---
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);
const ts = (v) => (v ? String(v) : null);
const nn = (v) => (v === "" || v === undefined ? null : v);
const SEV = { MILD: "mild", MODERATE: "moderate", SEVERE: "severe" };
const sevEnum = (v) => SEV[String(v || "").toUpperCase()] || "mild";

// --- PASS 1: rank patients ---
async function pass1Select() {
  console.log("PASS 1: loading dental whitelist codes...");
  const codes = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("dental_snomed_whitelist")
      .select("code")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) codes.add(String(r.code));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  whitelist codes: ${codes.size}`);

  const tally = new Map();
  const files = ["conditions.csv", "medications.csv", "devices.csv", "careplans.csv"];
  for (const f of files) {
    const table = f.replace(".csv", "");
    let n = 0;
    await readCsv(CSV, f, (r) => {
      scoreRow(table, r, tally, codes);
      if (++n % 500000 === 0) console.log(`  ${f}: ${n} rows...`);
    });
    console.log(`  scored ${f}: ${n} rows (tally=${tally.size})`);
  }
  const selected = selectTop(tally, LIMIT, DEMO_IDS);
  const dentalCount = [...tally.values()].filter((t) => t.dental > 0).length;
  const lane1Count = [...tally.values()].filter((t) => t.lane1 > 0).length;
  console.log(`  patients seen=${tally.size} dental>0=${dentalCount} lane1>0=${lane1Count}`);
  console.log(`  SELECTED=${selected.size} (limit=${LIMIT} + ${DEMO_IDS.length} demo forced)`);
  return selected;
}

// --- PASS 2: collect rows for selected patients ---
async function pass2Collect(sel) {
  const rows = {
    patients: [],
    emr_patients: [],
    emr_encounters: [],
    emr_conditions: [],
    emr_procedures: [],
    emr_medications: [],
    emr_allergies: [],
    patient_allergies: [],
    emr_imaging_studies: [],
    emr_careplans: [],
    emr_devices: [],
  };
  const encIds = new Set();
  const streamCount = async (file, onRow) => {
    let n = 0;
    await readCsv(CSV, file, (r) => {
      onRow(r);
      if (++n % 1000000 === 0) console.log(`  ${file}: ${n} rows...`);
    });
    console.log(`  streamed ${file}: ${n} rows`);
  };

  // patients: Id,BIRTHDATE,...,FIRST(7),MIDDLE(8),LAST(9),...,GENDER(15)
  await streamCount("patients.csv", (r) => {
    const id = r[0];
    if (!sel.has(id)) return;
    const fullName = [r[7], r[9]].filter(Boolean).join(" ");
    rows.patients.push({ id, full_name: fullName, dob: dateOnly(r[1]), gender: nn(r[15]) });
    rows.emr_patients.push({
      patient_id: id,
      synthea_id: id,
      birthdate: dateOnly(r[1]),
      gender: nn(r[15]),
    });
  });
  // encounters: Id,START,STOP,PATIENT,ORG,PROVIDER,PAYER,CLASS,CODE,DESC
  await streamCount("encounters.csv", (r) => {
    const pid = r[3];
    if (!sel.has(pid)) return;
    encIds.add(r[0]);
    rows.emr_encounters.push({
      id: r[0],
      patient_id: pid,
      synthea_encounter_id: r[0],
      code: nn(r[8]),
      description: nn(r[9]),
      class: nn(r[7]),
      encounter_start: ts(r[1]),
      encounter_stop: ts(r[2]),
      provider: nn(r[5]),
      organization: nn(r[4]),
    });
  });
  const enc = (v) => (encIds.has(v) ? v : null);
  // conditions: START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESC
  await streamCount("conditions.csv", (r) => {
    if (!sel.has(r[2])) return;
    rows.emr_conditions.push({
      patient_id: r[2],
      encounter_id: enc(r[3]),
      code: nn(r[5]),
      description: nn(r[6]),
      onset: dateOnly(r[0]),
      abatement: dateOnly(r[1]),
    });
  });
  // procedures: START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESC
  await streamCount("procedures.csv", (r) => {
    if (!sel.has(r[2])) return;
    rows.emr_procedures.push({
      patient_id: r[2],
      encounter_id: enc(r[3]),
      code: nn(r[5]),
      description: nn(r[6]),
      performed_at: ts(r[0]),
    });
  });
  // medications: START,STOP,PATIENT,PAYER,ENCOUNTER,CODE,DESC
  await streamCount("medications.csv", (r) => {
    if (!sel.has(r[2])) return;
    rows.emr_medications.push({
      patient_id: r[2],
      encounter_id: enc(r[4]),
      code: nn(r[5]),
      description: nn(r[6]),
      med_start: dateOnly(r[0]),
      med_stop: r[1] ? dateOnly(r[1]) : null,
    });
  });
  // allergies: START,STOP,PATIENT,ENCOUNTER,CODE,SYSTEM,DESC,TYPE,CATEGORY,...,SEVERITY1(11)
  await streamCount("allergies.csv", (r) => {
    if (!sel.has(r[2])) return;
    const desc = r[6];
    rows.emr_allergies.push({
      patient_id: r[2],
      code: nn(r[4]),
      description: nn(desc),
      severity: nn(r[11]),
    });
    if (desc && !/allergic disposition/i.test(desc)) {
      rows.patient_allergies.push({
        patient_id: r[2],
        allergen: desc,
        severity: sevEnum(r[11]),
        note: nn(r[8]),
      });
    }
  });
  // imaging_studies: Id,DATE,PATIENT,ENCOUNTER,...,BODYSITE_DESC(6),...,MODALITY_DESC(8)
  await streamCount("imaging_studies.csv", (r) => {
    if (!sel.has(r[2])) return;
    rows.emr_imaging_studies.push({
      patient_id: r[2],
      encounter_id: enc(r[3]),
      modality: nn(r[8]),
      body_site: nn(r[6]),
      study_date: ts(r[1]),
    });
  });
  // careplans: Id,START,STOP,PATIENT,ENCOUNTER,CODE,DESC
  await streamCount("careplans.csv", (r) => {
    if (!sel.has(r[3])) return;
    rows.emr_careplans.push({
      patient_id: r[3],
      encounter_id: enc(r[4]),
      code: nn(r[5]),
      description: nn(r[6]),
      cp_start: dateOnly(r[1]),
      cp_stop: dateOnly(r[2]),
    });
  });
  // devices: START,STOP,PATIENT,ENCOUNTER,CODE,DESC,UDI
  await streamCount("devices.csv", (r) => {
    if (!sel.has(r[2])) return;
    rows.emr_devices.push({
      patient_id: r[2],
      encounter_id: enc(r[3]),
      code: nn(r[4]),
      description: nn(r[5]),
      device_start: dateOnly(r[0]),
    });
  });
  return rows;
}

// --- DB write helpers ---
const chunk = (arr, n) => {
  const o = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
};

async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (e) {
    console.log(`  retry ${label}: ${e.message || e}`);
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

// Parents have deterministic PKs (Synthea UUIDs) -> UPSERT (never DELETE).
// Deleting emr_encounters/patients would fire ON DELETE SET NULL / CASCADE seq-scans on the
// unindexed child.encounter_id FKs -> statement timeout once tables are large. Upsert avoids it.
const PARENT_UPSERT = [
  ["patients", "id"],
  ["emr_patients", "synthea_id"],
  ["emr_encounters", "id"],
];
// Children have no natural key -> delete-by-patient_id (indexed/small) then insert. Idempotent.
const CHILD_TABLES = [
  "emr_conditions",
  "emr_procedures",
  "emr_medications",
  "emr_allergies",
  "emr_imaging_studies",
  "emr_careplans",
  "emr_devices",
  "patient_allergies",
];

async function deleteChildren(ids) {
  const idChunks = chunk(ids, 100);
  let done = 0;
  for (const ic of idChunks) {
    for (const t of CHILD_TABLES) {
      await withRetry(async () => {
        const { error } = await supabase.from(t).delete().in("patient_id", ic);
        if (error) throw error;
      }, `del ${t}`);
    }
    done += ic.length;
    if (done % 200 === 0 || done === ids.length)
      console.log(`  cleared children for ${done}/${ids.length} patients`);
  }
}

async function upsertParents(rows) {
  for (const [t, onConflict] of PARENT_UPSERT) {
    const data = rows[t];
    if (!data.length) continue;
    let n = 0;
    for (const c of chunk(data, 1000)) {
      await withRetry(async () => {
        const { error } = await supabase.from(t).upsert(c, { onConflict });
        if (error) throw error;
      }, `upsert ${t}`);
      n += c.length;
    }
    console.log(`  upserted ${t}: ${n} rows`);
  }
}

async function insertChildren(rows) {
  for (const t of CHILD_TABLES) {
    const data = rows[t];
    if (!data.length) continue;
    let n = 0;
    for (const c of chunk(data, 1000)) {
      await withRetry(async () => {
        const { error } = await supabase.from(t).insert(c);
        if (error) throw error;
      }, `ins ${t}`);
      n += c.length;
    }
    console.log(`  inserted ${t}: ${n} rows`);
  }
}

async function main() {
  const t0 = Date.now();
  let sel;
  if (IDS_ARG) {
    sel = new Set(
      IDS_ARG.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    console.log(`IDS mode: ${sel.size} patients (skip ranking)`);
  } else {
    sel = await pass1Select();
  }
  console.log("PASS 2: collecting rows...");
  const rows = await pass2Collect(sel);
  const ids = rows.patients.map((p) => p.id);
  console.log(`  matched patients in CSV: ${ids.length}`);
  console.log("UPSERT parents (patients / emr_patients / emr_encounters)...");
  await upsertParents(rows);
  console.log("CLEAR children (idempotent)...");
  await deleteChildren(ids);
  console.log("INSERT children...");
  await insertChildren(rows);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const allTables = ["patients", "emr_patients", "emr_encounters", ...CHILD_TABLES];
  const counts = Object.fromEntries(allTables.map((t) => [t, rows[t].length]));
  console.log("DONE in", secs, "s");
  console.log("ROW COUNTS", JSON.stringify(counts));
}

main().catch((e) => {
  console.error("FATAL", e.message || e);
  process.exit(1);
});
