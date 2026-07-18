// POST /api/compliance-judge — gác cổng tuân thủ tại điểm ký y lệnh (2 lớp).
// Lớp A tất định (thẩm quyền) + Lớp B RAG (phải người kiểm, hậu-kiểm citation).
// Auth = JWT user → RLS. Ghi audit compliance_judgments. action='ack' để lưu lý do.
import { createFileRoute } from "@tanstack/react-router";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { loadCopilotEnv } from "@/server/copilot/env";
import { runDeterministic } from "@/server/judge/deterministic";
import { retrieve } from "@/server/judge/rag";
import { JudgeOutputSchema } from "@/server/judge/schema";
import { JUDGE_PROMPT, buildJudgeContext } from "@/server/judge/prompt";
import { guardCitations } from "@/server/judge/citation-guard";
import type { JudgeDecision, Advisory, Insufficient } from "@/server/judge/types";

const PROC_VI: Record<string, string> = {
  implant: "cấy ghép implant nha khoa",
  extraction: "nhổ răng",
  root_canal: "điều trị tủy răng",
  scaling: "cạo vôi răng",
  filling: "trám răng",
  biopsy: "sinh thiết mô",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function handlePost({ request }: { request: Request }): Promise<Response> {
  const jwt = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  let env;
  try {
    env = loadCopilotEnv();
  } catch (e) {
    return json({ error: "server_misconfigured", detail: String(e) }, 500);
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  let body: {
    action?: string;
    patient_id?: string;
    visit_session_id?: string;
    procedure_type?: string;
    decisions?: JudgeDecision[];
    judgment_id?: string;
    ack_reasons?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ---- action = ack: lưu lý do ack sau khi bác sĩ xác nhận ----
  if (body.action === "ack") {
    if (!body.judgment_id) return json({ error: "judgment_id_required" }, 400);
    const { error } = await supabase
      .from("compliance_judgments")
      .update({ acked_by: userData.user.id, ack_reasons: body.ack_reasons ?? {} })
      .eq("id", body.judgment_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // ---- default: chạy judge ----
  const patientId = body.patient_id;
  const procedureType = body.procedure_type;
  if (!patientId || !procedureType) return json({ error: "patient_and_procedure_required" }, 400);
  const decisions = Array.isArray(body.decisions) ? body.decisions : [];

  // Lớp A — tất định (thẩm quyền). Lỗi RPC → chặn ký (KHÔNG trả 'clean' giả).
  let hardFindings;
  try {
    hardFindings = await runDeterministic(supabase, { patientId, procedureType, decisions });
  } catch (e) {
    return json({ error: "deterministic_failed", detail: String(e).slice(0, 200) }, 502);
  }

  // Lớp B — RAG (fail-safe: lỗi thì vẫn trả Lớp A).
  let advisories: Advisory[] = [];
  let insufficient: Insufficient[] = [];
  try {
    const openai = createOpenAI({ apiKey: env.openaiApiKey });
    const safetyFacts = hardFindings.filter((f) => f.type === "safety_flag").map((f) => f.message);
    const procLabel = PROC_VI[procedureType] ?? procedureType;
    const query = `${procLabel} ${safetyFacts.join(" ")}`.trim();

    const { chunks } = await retrieve(openai, supabase, query);
    if (chunks.length > 0) {
      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: JudgeOutputSchema,
        temperature: 0,
        system: JUDGE_PROMPT,
        prompt: buildJudgeContext({ procedureLabel: procLabel, safetyFacts, chunks }),
      });
      // guardCitations đã loại citation không thuộc `chunks` (=allowed) → an toàn dùng thẳng.
      const guarded = guardCitations(object, chunks);
      advisories = guarded.advisories;
      insufficient = guarded.insufficient;
    } else {
      insufficient = [{ topic: procLabel, note: "Không truy hồi được đoạn trích quy định liên quan trong nguồn hiện có." }];
    }
  } catch {
    insufficient = [{ topic: "rag", note: "Không đối chiếu được kho quy định lúc này; chỉ có kết quả kiểm tra tất định." }];
  }

  const verdict: "clean" | "has_findings" =
    hardFindings.length > 0 || advisories.length > 0 ? "has_findings" : "clean";

  // Ghi audit (không chặn phản hồi nếu lỗi ghi).
  let judgmentId: string | null = null;
  const { data: ins } = await supabase
    .from("compliance_judgments")
    .insert({
      visit_session_id: body.visit_session_id ?? null,
      patient_id: patientId,
      procedure_type: procedureType,
      findings: { hard_findings: hardFindings, advisories, insufficient },
      verdict,
    })
    .select("id")
    .single();
  if (ins?.id) judgmentId = ins.id as string;

  return json({ judgment_id: judgmentId, hard_findings: hardFindings, advisories, insufficient, verdict });
}

export const Route = createFileRoute("/api/compliance-judge")({
  server: { handlers: { POST: handlePost } },
});
