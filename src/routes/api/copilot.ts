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

  let body: { messages?: IncomingMessage[]; patient_id?: string };
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
  const patientId = typeof body.patient_id === "string" ? body.patient_id : undefined;

  // Nhét BN đang mở vào system context để model biết ngữ cảnh (tools vẫn tự resolve).
  const system = patientId
    ? `${SYSTEM_PROMPT}\n\nNGỮ CẢNH: nhân viên đang mở hồ sơ bệnh nhân có patient_id=${patientId}. Khi cần dữ liệu BN, gọi tool với đúng patient_id này.`
    : SYSTEM_PROMPT;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      messages,
      temperature: 0,
      tools: buildTools({ supabase, openai, patientId, citations }),
      stopWhen: stepCountIs(5),
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
