// Hậu-kiểm NHẸ tóm tắt (nhất quán scanLevel1 của ops-report): quét cụm suy diễn/phán bất thường/khuyến nghị.
// FAIL-OPEN: chỉ trả cờ + cụm khớp để log QA — KHÔNG chặn/sửa. Cụm đa từ độ chính xác cao, ít nhiễu.
const BANNED = [
  "bất thường", "nguy hiểm", "chẩn đoán", "khuyến nghị", "đề xuất",
  "nên xem xét", "cần điều trị", "cần phải", "có thể do", "nguyên nhân",
  "tăng cao", "quá cao", "quá thấp",
];

export function scanSummary(text: string | null): { ok: boolean; hits: string[] } {
  if (!text) return { ok: true, hits: [] };
  const lower = text.toLowerCase();
  const hits = BANNED.filter((p) => lower.includes(p));
  return { ok: hits.length === 0, hits };
}
