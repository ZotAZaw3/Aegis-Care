// POST /api/ops-report — báo cáo vận hành on-demand cho lãnh đạo (KHÔNG số hóa giao ban).
// Auth JWT → RLS. Server tự gọi get_ops_metrics (không tin client) → LLM Mức 1 → lưu ops_reports.
// Fail-safe: LLM lỗi → vẫn trả metrics (card là nguồn kiểm chứng). Non-admin → 403 (RPC RAISE 42501).
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { loadCopilotEnv } from "@/server/copilot/env";
import { OPS_REPORT_PROMPT } from "@/server/ops-report/prompt";
import { scanLevel1 } from "@/server/ops-report/guard";

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

  // Nguồn sự thật: server tự gọi get_ops_metrics (snapshot hiện tại, RLS admin). Lỗi quyền → 403.
  const { data: metrics, error: mErr } = await supabase.rpc("get_ops_metrics");
  if (mErr) {
    const forbidden = mErr.code === "42501" || /admin role required|insufficient/i.test(mErr.message ?? "");
    return json({ error: forbidden ? "forbidden" : mErr.message }, forbidden ? 403 : 400);
  }

  // Fallback P02: snapshot stock hôm nay (best-effort, không chặn nếu lỗi/không quyền).
  await supabase.rpc("snapshot_ops_metrics").then(
    () => {},
    () => {},
  );

  // LLM Mức 1 — fail-safe: lỗi thì report=null, vẫn trả metrics.
  let report: string | null = null;
  try {
    const openai = createOpenAI({ apiKey: env.openaiApiKey });
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      temperature: 0,
      system: OPS_REPORT_PROMPT,
      prompt: `Số liệu vận hành (JSON):\n${JSON.stringify(metrics)}`,
    });
    report = text?.trim() || null;
  } catch {
    report = null;
  }

  // Hậu-kiểm Mức 1 (fail-open): chỉ log QA nếu lọt cụm nguyên nhân/khuyến nghị — không chặn/sửa.
  const scan = scanLevel1(report);
  if (!scan.ok) console.warn(`[ops-report] Nghi vi phạm Mức 1 — cụm: ${scan.hits.join(", ")}`);

  // Lưu lịch sử (không chặn phản hồi nếu ghi lỗi). period lấy từ metrics.period (đã chuẩn hóa).
  const period = (metrics as { period?: { from?: string; to?: string } })?.period ?? {};
  const today = new Date().toISOString().slice(0, 10);
  let reportId: string | null = null;
  const { data: ins, error: insErr } = await supabase
    .from("ops_reports")
    .insert({
      period_from: period.from ?? today,
      period_to: period.to ?? today,
      metrics,
      report,
      created_by: userData.user.id,
    })
    .select("id")
    .single();
  if (insErr) console.warn(`[ops-report] Lưu ops_reports lỗi: ${insErr.message}`);
  if (ins?.id) reportId = ins.id as string;

  return json({ id: reportId, report, metrics, level1_flag: !scan.ok });
}

export const Route = createFileRoute("/api/ops-report")({
  server: { handlers: { POST: handlePost } },
});
