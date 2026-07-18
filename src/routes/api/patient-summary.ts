// POST /api/patient-summary — tóm tắt hồ sơ BN từ Customer Graph (retrieval-only, KHÔNG RAG pháp lý).
// Auth JWT → RLS. Server tự gọi 3 RPC graph (briefing/safety/crm) → LLM narrate. Fail-safe.
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { loadCopilotEnv } from "@/server/copilot/env";
import { PATIENT_SUMMARY_PROMPT } from "@/server/patient-summary/prompt";
import { scanSummary } from "@/server/patient-summary/guard";

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

  let body: { patient_id?: string } = {};
  try { body = await request.json(); } catch { /* patient_id bắt buộc dưới */ }
  const patientId = body.patient_id;
  if (!patientId) return json({ error: "patient_id_required" }, 400);

  // Truy xuất Customer Graph (RLS staff). Lỗi RPC → vẫn tiếp với phần có được.
  const [briefing, safety, crm] = await Promise.all([
    supabase.rpc("get_briefing_source", { p_patient_id: patientId }),
    supabase.rpc("get_safety_panel", { p_patient_id: patientId }),
    supabase.rpc("get_crm_recall", { p_patient_id: patientId }),
  ]);
  // Không nuốt lỗi RPC âm thầm (RLS chặn / RPC lỗi) — log để debug prod.
  for (const [name, r] of [["briefing", briefing], ["safety", safety], ["crm", crm]] as const) {
    if (r.error) console.warn(`[patient-summary] RPC ${name} lỗi: ${r.error.message}`);
  }

  const facts = {
    safety: safety.data ?? null,
    dental_history: briefing.data ?? null,
    recall: crm.data ?? null,
  };

  // LLM narrate — fail-safe: lỗi → summary=null.
  let summary: string | null = null;
  try {
    const openai = createOpenAI({ apiKey: env.openaiApiKey });
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      temperature: 0,
      system: PATIENT_SUMMARY_PROMPT,
      prompt: `Dữ kiện hồ sơ bệnh nhân (JSON):\n${JSON.stringify(facts)}`,
    });
    summary = text?.trim() || null;
  } catch {
    summary = null;
  }

  // Hậu-kiểm retrieval-not-inference (fail-open): log QA nếu lọt cụm suy diễn/phán bất thường.
  const scan = scanSummary(summary);
  if (!scan.ok) console.warn(`[patient-summary] Nghi vi phạm retrieval-only — cụm: ${scan.hits.join(", ")}`);

  return json({ summary });
}

export const Route = createFileRoute("/api/patient-summary")({
  server: { handlers: { POST: handlePost } },
});
