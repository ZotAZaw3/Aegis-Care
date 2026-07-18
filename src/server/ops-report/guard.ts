// Hậu-kiểm NHẸ báo cáo Mức 1: quét cụm từ giải thích nguyên nhân / khuyến nghị lọt qua prompt.
// FAIL-OPEN có chủ đích: chỉ trả cờ + cụm khớp để log QA — KHÔNG chặn/xóa/sửa báo cáo.
// Lý do fail-open: tiếng Việt nhiều từ ngắn dễ khớp nhầm; xóa báo cáo thật vì 1 từ nguy hiểm hơn.
// Danh sách chọn cụm ĐỘ CHÍNH XÁC CAO (đa từ) để cảnh báo có ý nghĩa, ít nhiễu.
const BANNED_LEVEL1 = [
  // giải thích nguyên nhân (Mức 2)
  "nguyên nhân",
  "bởi vì",
  "lý do là",
  "là bởi",
  "xuất phát từ",
  "có thể do",
  // khuyến nghị / chỉ đạo hành động (Mức 3)
  "khuyến nghị",
  "đề xuất",
  "kiến nghị",
  "đề nghị",
  "nên xem xét",
  "cần phải",
  "chúng ta nên",
];

export function scanLevel1(report: string | null): { ok: boolean; hits: string[] } {
  if (!report) return { ok: true, hits: [] };
  const lower = report.toLowerCase();
  const hits = BANNED_LEVEL1.filter((p) => lower.includes(p));
  return { ok: hits.length === 0, hits };
}
