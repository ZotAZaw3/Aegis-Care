// Prompt Judge (Lớp B) — biến thể CHẶT của copilot system-prompt. Mục tiêu duy nhất:
// zero false assertion. Model KHÔNG kết luận lâm sàng, KHÔNG phán được/không được;
// mỗi điểm phải trỏ citation_ids từ danh sách chunk được cấp, không thì bỏ vào insufficient.

export const JUDGE_PROMPT = [
  "Bạn là bộ ĐỐI CHIẾU tuân thủ cho phòng khám nha khoa, hỗ trợ bác sĩ TRƯỚC khi ký y lệnh.",
  "Đầu vào: loại thủ thuật, một số DỮ KIỆN đã ghi của bệnh nhân (cờ an toàn), và các ĐOẠN TRÍCH quy định/SOP kèm id.",
  "Nhiệm vụ: liệt kê các 'điểm cần đối chiếu' để bác sĩ tự kiểm — KHÔNG thay bác sĩ quyết định.",
  "",
  "LUẬT BẤT BIẾN (vi phạm = hỏng):",
  "- TUYỆT ĐỐI KHÔNG chẩn đoán, KHÔNG khuyến nghị điều trị, KHÔNG phán 'được/không được', 'nên/không nên', KHÔNG đánh giá nguy cơ lâm sàng.",
  "- CHỈ dùng nội dung trong các đoạn trích được cấp. KHÔNG dùng kiến thức ngoài.",
  "- MỖI advisory PHẢI kèm 'citation_ids' trỏ tới id đoạn trích thực sự chứa căn cứ. KHÔNG bịa id.",
  "- Nếu một chủ đề liên quan nhưng đoạn trích KHÔNG nêu kết luận/yêu cầu rõ ràng → KHÔNG tạo advisory; đưa vào 'insufficient' với ghi chú 'cần đối chiếu thêm [tên văn bản]'.",
  "- Nếu không có đoạn trích nào phù hợp → advisories rỗng. Thà bỏ sót còn hơn nói sai.",
  "",
  "PHONG CÁCH: tiếng Việt, ngắn gọn, trung tính, mỗi điểm 1-2 câu. Chỉ trả JSON đúng schema.",
].join("\n");

// Ghép ngữ cảnh cho model: thủ thuật + cờ an toàn + đoạn trích (kèm id để trích dẫn).
export function buildJudgeContext(input: {
  procedureLabel: string;
  safetyFacts: string[];
  chunks: Array<{ id: string; citation: string; content: string }>;
}): string {
  const flags = input.safetyFacts.length ? input.safetyFacts.join("; ") : "(không có cờ an toàn nổi bật)";
  const passages = input.chunks
    .map((c, i) => `[${i + 1}] id=${c.id} | ${c.citation}\n${c.content}`)
    .join("\n\n");
  return [
    `THỦ THUẬT: ${input.procedureLabel}`,
    `DỮ KIỆN BỆNH NHÂN (cờ an toàn đã ghi): ${flags}`,
    "",
    "ĐOẠN TRÍCH QUY ĐỊNH/SOP (chỉ được dùng nội dung dưới đây; trích dẫn bằng id):",
    passages || "(không truy hồi được đoạn trích nào)",
  ].join("\n");
}
