// 8 tool tra cứu cho copilot. Mỗi execute gọi supabase (RLS theo JWT user) — CHỈ ĐỌC.
// kb_search embed query bằng OpenAI trước rồi rpc kb_search (hybrid RRF). Citations của
// kb_search được push vào mảng dùng chung để route gom trả về (minh bạch nguồn pháp lý).
import { tool, embed } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const PROCEDURE_TYPES = ["implant", "extraction", "root_canal", "scaling", "filling", "biopsy"] as const;
const EMBED_MODEL = "text-embedding-3-small";

export interface Citation {
  source: string;
  detail: string;
}

interface BuildToolsArgs {
  supabase: SupabaseClient;
  openai: OpenAIProvider;
  patientId?: string;
  citations: Citation[];
}

// Gộp patient_id ưu tiên từ ngữ cảnh request (BN đang mở) rồi mới từ tham số model.
function resolvePatient(argId: string | undefined, ctxId: string | undefined): string | undefined {
  return argId || ctxId;
}

export function buildTools({ supabase, openai, patientId, citations }: BuildToolsArgs) {
  return {
    kb_search: tool({
      description:
        "Tra cứu quy định pháp lý / quy trình (SOP) trong kho tài liệu tuân thủ VN. Dùng cho MỌI câu hỏi về quy định, luật, thủ tục, cam kết. Trả các đoạn trích kèm trích dẫn (số hiệu văn bản, Điều/Khoản, trang).",
      inputSchema: z.object({
        query: z.string().describe("Câu truy vấn tiếng Việt, cụ thể theo câu hỏi của nhân viên."),
      }),
      execute: async ({ query }) => {
        const { embedding } = await embed({ model: openai.embedding(EMBED_MODEL), value: query });
        const { data, error } = await supabase.rpc("kb_search", {
          p_query: query,
          p_embedding: JSON.stringify(embedding),
          p_k: 8,
        });
        if (error) return { error: error.message, results: [] };
        const rows = (data ?? []) as Array<{ citation: string; content: string; page_start: number | null }>;
        for (const r of rows.slice(0, 5)) {
          if (!citations.some((c) => c.source === r.citation)) {
            citations.push({ source: r.citation, detail: `trang ${r.page_start ?? "?"}` });
          }
        }
        return {
          results: rows.map((r) => ({ citation: r.citation, content: r.content, page_start: r.page_start })),
        };
      },
    }),

    find_patient: tool({
      description:
        "Tra bệnh nhân theo TÊN (và tùy chọn ngày sinh) để lấy patient_id. BẮT BUỘC gọi tool này trước khi dùng các tool hồ sơ (safety_panel, patient_history, crm_recall) khi người dùng nêu tên bệnh nhân mà chưa có patient_id trong ngữ cảnh. Trả tối đa 5 kết quả khớp.",
      inputSchema: z.object({
        name: z.string().describe("Tên (hoặc một phần tên) bệnh nhân, tiếng Việt."),
        dob: z.string().optional().describe("Ngày sinh YYYY-MM-DD nếu người dùng cung cấp, để thu hẹp kết quả."),
      }),
      execute: async ({ name, dob }) => {
        let q = supabase
          .from("patients")
          .select("id, full_name, dob, phone")
          .ilike("full_name", `%${name}%`)
          .limit(5);
        if (dob) q = q.eq("dob", dob);
        const { data, error } = await q;
        if (error) return { error: error.message, matches: [] };
        return { matches: data ?? [] };
      },
    }),

    safety_panel: tool({
      description:
        "Lấy dữ liệu an toàn ADVISORY của bệnh nhân: dị ứng, thuốc đang dùng, cờ bệnh nền liên quan nha. Đây là dữ kiện đã ghi, KHÔNG phải khuyến nghị. Nhắc người dùng panel an toàn trên giao diện mới là nguồn quyết định.",
      inputSchema: z.object({
        patient_id: z.string().optional().describe("UUID bệnh nhân; bỏ trống nếu đã có BN đang mở."),
      }),
      execute: async ({ patient_id }) => {
        const pid = resolvePatient(patient_id, patientId);
        if (!pid) return { error: "Chưa xác định bệnh nhân." };
        const { data, error } = await supabase.rpc("get_safety_panel", { p_patient_id: pid });
        if (error) return { error: error.message };
        return { safety: data };
      },
    }),

    patient_history: tool({
      description: "Lấy nguồn bệnh sử nha khoa (encounter/điều kiện/thủ thuật đã ghi) của bệnh nhân để tường thuật, retrieval-only.",
      inputSchema: z.object({
        patient_id: z.string().optional(),
      }),
      execute: async ({ patient_id }) => {
        const pid = resolvePatient(patient_id, patientId);
        if (!pid) return { error: "Chưa xác định bệnh nhân." };
        const { data, error } = await supabase.rpc("get_briefing_source", { p_patient_id: pid });
        if (error) return { error: error.message };
        return { history: data };
      },
    }),

    crm_recall: tool({
      description: "Lấy thông tin CRM/recall nha khoa: lần khám nha gần nhất, follow-up đang treo, thủ thuật nha đã làm.",
      inputSchema: z.object({
        patient_id: z.string().optional(),
      }),
      execute: async ({ patient_id }) => {
        const pid = resolvePatient(patient_id, patientId);
        if (!pid) return { error: "Chưa xác định bệnh nhân." };
        const { data, error } = await supabase.rpc("get_crm_recall", { p_patient_id: pid });
        if (error) return { error: error.message };
        return { crm: data };
      },
    }),

    patient_labs: tool({
      description:
        "Lấy KẾT QUẢ XÉT NGHIỆM đã ghi của bệnh nhân (INR, HbA1c, tiểu cầu, huyết áp, đường huyết, hút thuốc, WBC, creatinine). Trả GIÁ TRỊ + ĐƠN VỊ + NGÀY + khoảng tham chiếu KB. Đây là dữ kiện đã ghi — chỉ thuật lại số + ngày, KHÔNG diễn giải 'bất thường/cao/thấp', KHÔNG khuyến nghị.",
      inputSchema: z.object({
        patient_id: z.string().optional().describe("UUID bệnh nhân; bỏ trống nếu đã có BN đang mở."),
        codes: z.array(z.string()).optional().describe("Mã LOINC lọc (vd ['6301-6'] cho INR); bỏ trống = tất cả."),
      }),
      execute: async ({ patient_id, codes }) => {
        const pid = resolvePatient(patient_id, patientId);
        if (!pid) return { error: "Chưa xác định bệnh nhân." };
        const { data, error } = await supabase.rpc("get_observation_history", {
          p_patient_id: pid,
          p_codes: codes ?? null,
        });
        if (error) return { error: error.message };
        return { labs: data };
      },
    }),

    open_violations: tool({
      description: "Liệt kê các y lệnh đang vi phạm (quá hạn còn mở / mở khi đóng ca / consent chưa đóng). Lọc theo bệnh nhân nếu có.",
      inputSchema: z.object({
        patient_id: z.string().optional(),
      }),
      execute: async ({ patient_id }) => {
        const pid = resolvePatient(patient_id, patientId);
        let q = supabase.from("order_violations").select("*").limit(50);
        if (pid) q = q.eq("patient_id", pid);
        const { data, error } = await q;
        if (error) return { error: error.message, violations: [] };
        return { violations: data ?? [] };
      },
    }),

    order_drafts: tool({
      description: "Lấy NHÁP gợi ý y lệnh chuẩn theo loại thủ thuật (từ KB). Đây chỉ là gợi ý tham chiếu — KHÔNG tự tạo y lệnh; việc ký/thực thi do người quyết.",
      inputSchema: z.object({
        procedure_type: z.enum(PROCEDURE_TYPES).describe("Loại thủ thuật."),
      }),
      execute: async ({ procedure_type }) => {
        const { data, error } = await supabase.rpc("get_order_drafts", { p_procedure_type: procedure_type });
        if (error) return { error: error.message };
        return { drafts: data };
      },
    }),
  };
}
