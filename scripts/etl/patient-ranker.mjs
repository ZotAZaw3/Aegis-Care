// Scoring for patient selection: dental-richness + Lane1 systemic bonus.
// Keeps only aggregate numbers per patient (Map<pid,{dental,lane1}>) — memory-safe.

// Dental-richness keywords (EN + VI) matched against description text.
const DENTAL_RE =
  /implant|periodont|nha chu|oral cancer|carcinoma (?:in situ )?of mouth|malignant.*mouth|ung thư (?:miệng|khoang miệng|miệng)|orthodont|chỉnh nha|extraction|root canal|endodont|pulpitis|apical abscess|gingivit|caries|dental/i;

// Lane1 anticoagulant / bisphosphonate / high-risk systemic meds (RxNorm description).
const LANE1_MED_RE =
  /warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|clopidogrel|ticagrelor|prasugrel|aspirin|heparin|enoxaparin|bisphosphonate|alendronat|risedronat|ibandronat|zoledron|pamidronat|denosumab|insulin|prednison|prednisolon|dexamethason|methotrexat/i;

// Lane1 systemic conditions.
const LANE1_COND_RE =
  /diabetes|tiểu đường|tiểu đường|hypertension|atrial fibrillation|myocardial infarction|osteoporos|immunodefic|chronic kidney|leukemia|lymphoma/i;

// scoreRow: mutate the per-patient tally. `codes` = Set of whitelist SNOMED codes.
export function scoreRow(table, row, tally, codes) {
  let pid, code, desc;
  switch (table) {
    case "conditions": // START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESCRIPTION
      pid = row[2];
      code = row[5];
      desc = row[6];
      if (codes.has(code) || DENTAL_RE.test(desc)) bump(tally, pid, "dental");
      if (LANE1_COND_RE.test(desc)) bump(tally, pid, "lane1");
      break;
    case "procedures": // START,STOP,PATIENT,ENCOUNTER,SYSTEM,CODE,DESCRIPTION
      pid = row[2];
      code = row[5];
      desc = row[6];
      if (codes.has(code) || DENTAL_RE.test(desc)) bump(tally, pid, "dental");
      break;
    case "medications": // START,STOP,PATIENT,PAYER,ENCOUNTER,CODE,DESCRIPTION
      pid = row[2];
      desc = row[6];
      if (LANE1_MED_RE.test(desc)) bump(tally, pid, "lane1");
      break;
    case "devices": // START,STOP,PATIENT,ENCOUNTER,CODE,DESCRIPTION,UDI
      pid = row[2];
      desc = row[5];
      if (DENTAL_RE.test(desc)) bump(tally, pid, "dental");
      break;
    case "careplans": // Id,START,STOP,PATIENT,ENCOUNTER,CODE,DESCRIPTION
      pid = row[3];
      desc = row[6];
      if (DENTAL_RE.test(desc)) bump(tally, pid, "dental");
      break;
    default:
      break;
  }
}

function bump(tally, pid, key) {
  if (!pid) return;
  let t = tally.get(pid);
  if (!t) {
    t = { dental: 0, lane1: 0 };
    tally.set(pid, t);
  }
  t[key]++;
}

// Combined weight: dental dominates selection, Lane1 is a strong tiebreak bonus.
export function combinedScore(t) {
  return t.dental * 10 + t.lane1 * 3;
}

// Rank patients: prefer dental>0, order by combinedScore desc, take top `limit`.
// Always union the forced demo ids so they survive.
export function selectTop(tally, limit, forcedIds) {
  const withDental = [];
  const withoutDental = [];
  for (const [pid, t] of tally) {
    (t.dental > 0 ? withDental : withoutDental).push([pid, combinedScore(t)]);
  }
  withDental.sort((a, b) => b[1] - a[1]);
  withoutDental.sort((a, b) => b[1] - a[1]);
  const ordered = withDental.concat(withoutDental);
  const selected = new Set(forcedIds);
  for (const [pid] of ordered) {
    if (selected.size >= limit) break;
    selected.add(pid);
  }
  return selected;
}
