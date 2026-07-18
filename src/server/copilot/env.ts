// Server-only env cho copilot route. Secret (OPENAI_API_KEY) chỉ đọc từ process.env;
// local dev nạp bổ sung từ .dev.vars (gitignored) nếu process.env chưa có. Public
// Supabase URL/anon lấy từ import.meta.env.VITE_* (Vite inline lúc build) rồi mới process.env.
// Không log giá trị key ra console.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let devVarsLoaded = false;

// Nạp .dev.vars vào process.env (chỉ 1 lần, chỉ khi thiếu). No-op trên Vercel (không có file).
function ensureDevVars(): void {
  if (devVarsLoaded) return;
  devVarsLoaded = true;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".dev.vars"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // Không có .dev.vars (production) — dựa hoàn toàn vào process.env.
  }
}

export interface CopilotEnv {
  openaiApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function loadCopilotEnv(): CopilotEnv {
  ensureDevVars();
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const supabaseUrl = meta.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey =
    meta.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const openaiApiKey = process.env.OPENAI_API_KEY || "";

  const missing: string[] = [];
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (missing.length) throw new Error(`Thiếu biến môi trường server: ${missing.join(", ")}`);

  return { openaiApiKey, supabaseUrl, supabaseAnonKey };
}
