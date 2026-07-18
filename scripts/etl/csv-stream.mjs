// Quote-aware CSV line parser + streaming reader (copied pattern from supabase/seed-demo-patients.mjs).
// Streams line-by-line via readline — never loads whole file into RAM.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

export function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// Stream a CSV file, calling onRow(fields, header) for each data row.
export async function readCsv(csvDir, file, onRow) {
  const rl = createInterface({
    input: createReadStream(join(csvDir, file), "utf8"),
    crlfDelay: Infinity,
  });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = parseLine(line);
      continue;
    }
    onRow(parseLine(line), header);
  }
}
