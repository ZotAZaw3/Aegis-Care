// Unit test thuần (không framework) — chứng minh RĂNG CƯA chống-sai:
// advisory có citation KHÔNG thuộc chunk lượt này bị DROP; advisory có citation thật được giữ.
// Chạy: node scripts/test-citation-guard.mjs  (Node ≥23 tự strip types của .ts import).
import { guardCitations } from "../src/server/judge/citation-guard.ts";

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  ✗", msg); } };

const chunks = [
  { id: "c1", citation: "TT 16/2018 — Điều 3", page_start: 5, content: "..." },
  { id: "c2", citation: "Luật 15/2023 — Điều 40", page_start: 12, content: "..." },
];

const raw = {
  advisories: [
    { message: "Điểm có căn cứ thật", citation_ids: ["c1"] },            // giữ
    { message: "Điểm trích dẫn MA", citation_ids: ["c999"] },            // drop
    { message: "Điểm không trích dẫn", citation_ids: [] },               // drop
    { message: "Điểm nửa thật nửa ma", citation_ids: ["c2", "cX"] },     // giữ, chỉ c2
  ],
  insufficient: [{ topic: "chủ đề X", note: "cần đối chiếu thêm" }],
};

const out = guardCitations(raw, chunks);

assert(out.advisories.length === 2, `phải giữ 2 advisory, thực tế ${out.advisories.length}`);
assert(out.dropped === 2, `phải drop 2 (citation ma + rỗng), thực tế ${out.dropped}`);
assert(out.advisories[0].citations.every((c) => c.chunk_id === "c1"), "advisory 1 chỉ citation c1");
assert(
  out.advisories[1].citations.length === 1 && out.advisories[1].citations[0].chunk_id === "c2",
  "advisory nửa-ma chỉ giữ citation thật c2 (loại cX)",
);
assert(out.advisories.every((a) => a.citations.every((c) => chunks.some((k) => k.id === c.chunk_id))),
  "MỌI citation còn lại đều map vào chunk thật (0 citation ma)");
assert(out.insufficient.length === 1, "giữ nguyên insufficient");

console.log(`\ncitation-guard: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
