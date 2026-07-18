// RĂNG CƯA chống-sai: chỉ giữ advisory có citation trỏ tới chunk THỰC SỰ nằm trong
// kết quả kb_search lượt này. Advisory không có citation hợp lệ nào → DROP (không hiện).
// Đây là thứ biến "zero false assertion" thành cưỡng chế được, không chỉ dựa vào prompt.
import type { Advisory, Insufficient } from "./types";
import type { Chunk } from "./rag";
import type { JudgeOutput } from "./schema";

export function guardCitations(
  raw: JudgeOutput,
  chunks: Chunk[],
): { advisories: Advisory[]; insufficient: Insufficient[]; dropped: number } {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const advisories: Advisory[] = [];
  const insufficient: Insufficient[] = [...(raw.insufficient ?? [])];
  let dropped = 0;

  for (const a of raw.advisories ?? []) {
    const validIds = (a.citation_ids ?? []).filter((id) => byId.has(id));
    if (validIds.length === 0) {
      dropped++; // citation ma / không căn cứ → loại bỏ hoàn toàn
      continue;
    }
    advisories.push({
      message: a.message,
      citations: validIds.map((id) => {
        const c = byId.get(id)!;
        return { citation: c.citation, page: c.page_start, chunk_id: id };
      }),
    });
  }

  return { advisories, insufficient, dropped };
}
