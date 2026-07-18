// POST /api/copilot — orchestrator tra cứu (Vercel AI SDK). TanStack Start 1.168 server
// route: createFileRoute(...).server.handlers.POST (ctx.request -> Response).
// Auth = JWT user: anon key + Authorization header -> RLS áp theo user. KHÔNG service role.
// Trả JSON { answer, citations[], tool_calls[] }. Tools tách sang src/server/copilot/tools.ts.
import { createFileRoute } from "@tanstack/react-router";
import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { buildTools, type Citation } from "@/server/copilot/tools";
import { SYSTEM_PROMPT } from "@/server/copilot/system-prompt";
import { loadCopilotEnv } from "@/server/copilot/env";

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handlePost({ request }: { request: Request }): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  let env;
  try {
    env = loadCopilotEnv();
  } catch (e) {
    return json({ error: "server_misconfigured", detail: String(e) }, 500);
  }

  // RLS sống theo user: anon key + Authorization = JWT của nhân viên.
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  let body: { messages?: IncomingMessage[]; patient_id?: string; patients?: { id: string; name: string }[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const messages = (body.messages ?? []).filter(
    (m) => m && typeof m.content === "string" && ["user", "assistant", "system"].includes(m.role),
  );
  if (!messages.length) return json({ error: "messages_required" }, 400);

  const openai = createOpenAI({ apiKey: env.openaiApiKey });
  const citations: Citation[] = [];
  // Ghim nhiều BN (trang Trợ lý) hoặc 1 BN đang mở (floating). Default tool = 1 BN nếu chỉ có 1.
  const pinned = Array.isArray(body.patients) ? body.patients.filter((p) => p?.id && p?.name) : [];
  const patientId =
    typeof body.patient_id === "string" ? body.patient_id : pinned.length === 1 ? pinned[0].id : undefined;

  let system = SYSTEM_PROMPT;
  if (pinned.length > 1) {
    const list = pinned.map((p) => `- ${p.name} (patient_id=${p.id})`).join("\n");
    system += `\n\nNGỮ CẢNH: nhân viên đang xét NHIỀU bệnh nhân cùng lúc:\n${list}\nKhi cần dữ liệu của một BN, gọi tool với ĐÚNG patient_id tương ứng; lặp tool cho từng BN nếu câu hỏi liên quan nhiều người. Trình bày theo từng bệnh nhân.`;
  } else if (patientId) {
    system += `\n\nNGỮ CẢNH: nhân viên đang mở hồ sơ bệnh nhân có patient_id=${patientId}. Khi cần dữ liệu BN, gọi tool với đúng patient_id này.`;
  }

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      messages,
      temperature: 0,
      tools: buildTools({ supabase, openai, patientId, citations }),
      stopWhen: stepCountIs(pinned.length > 1 ? 12 : 5),
    });

    const toolCalls = result.steps.flatMap((s) =>
      (s.toolCalls ?? []).map((tc) => ({
        tool: tc.toolName,
        args_summary: summarizeArgs(tc.input),
      })),
    );

    return json({ answer: result.text, citations, tool_calls: toolCalls });
  } catch (e) {
    return json({ error: "llm_error", detail: String(e).slice(0, 400) }, 502);
  }
}

// Rút gọn args tool cho minh bạch UI (không đổ nguyên payload).
function summarizeArgs(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const val = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}=${val.length > 60 ? `${val.slice(0, 60)}…` : val}`);
  }
  return parts.join(", ");
}

export const Route = createFileRoute("/api/copilot")({
  server: { handlers: { POST: handlePost } },
});
