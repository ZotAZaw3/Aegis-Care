// Schema output Lớp B (generateObject ép JSON). Model chỉ được nêu advisory kèm
// citation_ids trỏ tới các chunk ĐÃ cấp; không trích được thì đưa vào insufficient.
import { z } from "zod";

export const JudgeOutputSchema = z.object({
  advisories: z
    .array(
      z.object({
        message: z.string().describe("Điểm cần đối chiếu, tiếng Việt, trung tính."),
        citation_ids: z
          .array(z.string())
          .describe("Danh sách id chunk (từ danh sách được cấp) làm căn cứ cho điểm này."),
      }),
    )
    .describe("Chỉ đưa điểm có căn cứ trích dẫn. Không có căn cứ → để trống, dùng insufficient."),
  insufficient: z
    .array(
      z.object({
        topic: z.string(),
        note: z.string().describe("Vì sao chưa đủ căn cứ; cần đối chiếu văn bản nào."),
      }),
    )
    .describe("Chủ đề liên quan nhưng nguồn không nêu kết luận rõ."),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;
