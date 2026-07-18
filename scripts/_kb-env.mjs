// Shared env + client helpers cho ingest / eval KB (Phase C).
// Đọc secret từ .dev.vars (gitignored) + URL từ .env — KHÔNG in ra giá trị key.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function loadKbEnv() {
  const devVars = parseEnvFile(resolve(REPO_ROOT, '.dev.vars'));
  const dotEnv = parseEnvFile(resolve(REPO_ROOT, '.env'));

  const openaiKey = process.env.OPENAI_API_KEY || devVars.OPENAI_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || devVars.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || dotEnv.VITE_SUPABASE_URL;

  const missing = [];
  if (!openaiKey) missing.push('OPENAI_API_KEY (.dev.vars)');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY (.dev.vars)');
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL (.env)');
  if (missing.length) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
  }
  return { openaiKey, serviceKey, supabaseUrl, REPO_ROOT };
}

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;

// Embed 1 batch (<=100 input) qua OpenAI embeddings API. Trả mảng vector số thực.
export async function embedBatch(inputs, openaiKey) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIM }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  // API giữ nguyên thứ tự theo index — sort để chắc chắn.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// True nếu lỗi Supabase là "bảng chưa tồn tại" (migration chưa được dán).
export function isMissingTableError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes("could not find the table") ||
    msg.includes('schema cache')
  );
}
