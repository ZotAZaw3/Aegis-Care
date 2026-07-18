// Phase C — Ingest chunks.jsonl vào Supabase kb_chunks.
//   chunks.jsonl -> OpenAI text-embedding-3-small (batch <=100) -> upsert kb_chunks
// Idempotent: upsert onConflict 'id' (id = chunk_id từ chunker). Re-run không nhân đôi.
// Secret lấy từ .dev.vars / .env (không in ra). Chạy: node scripts/ingest-kb-chunks.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadKbEnv, embedBatch, isMissingTableError } from './_kb-env.mjs';

const EMBED_BATCH = 100; // OpenAI input/call
const DB_BATCH = 500; // rows/upsert

function readChunks(repoRoot) {
  const path = resolve(repoRoot, 'services', 'rag-ingest', 'output', 'chunks.jsonl');
  const raw = readFileSync(path, 'utf8');
  const seen = new Map(); // chunk_id -> số lần đã gặp
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    // Parser gốc phát sinh vài clause_id trùng ở luật sửa đổi (LAW_51_2024 Điều 1).
    // KHÔNG bỏ (mất nội dung) — disambiguate xác định theo thứ tự file (idempotent).
    const n = seen.get(c.chunk_id) || 0;
    seen.set(c.chunk_id, n + 1);
    const id = n === 0 ? c.chunk_id : `${c.chunk_id}__dup${n + 1}`;
    rows.push({
      id,
      doc_id: c.doc_id,
      citation: c.citation,
      dieu: c.dieu_so != null ? String(c.dieu_so) : null,
      khoan: c.khoan_so != null ? String(c.khoan_so) : null,
      page_start: c.page_start ?? null,
      page_end: c.page_end ?? null,
      content: c.text,
    });
  }
  return { rows, path };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const { openaiKey, serviceKey, supabaseUrl, REPO_ROOT } = loadKbEnv();
  const { rows, path } = readChunks(REPO_ROOT);
  console.log(`[ingest] đọc ${rows.length} chunk từ ${path}`);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Pre-flight: bảng kb_chunks đã tồn tại chưa? (user dán migration bằng tay)
  // Dùng select thật (không head) — head request KHÔNG lộ lỗi missing-table.
  const probe = await supabase.from('kb_chunks').select('id').limit(1);
  if (probe.error && isMissingTableError(probe.error)) {
    console.log(
      '\n[ingest] BẢNG kb_chunks CHƯA TỒN TẠI.\n' +
        '        -> Dán migration supabase/migrations/20260718120000_kb_vector_store.sql\n' +
        '           vào Supabase SQL Editor TRƯỚC, rồi chạy lại script này.\n'
    );
    return; // exit 0 sạch (tránh crash libuv khi process.exit giữa lúc socket đóng)
  }
  if (probe.error) throw new Error(`Supabase probe lỗi: ${probe.error.message}`);

  // Embed theo batch <=100, tích lũy embedding vào từng row.
  const batches = chunk(rows, EMBED_BATCH);
  let embedded = 0;
  for (const b of batches) {
    const vectors = await embedBatch(b.map((r) => r.content), openaiKey);
    b.forEach((r, i) => {
      r.embedding = vectors[i];
    });
    embedded += b.length;
    process.stdout.write(`\r[ingest] embedded ${embedded}/${rows.length}`);
  }
  process.stdout.write('\n');

  // Upsert theo batch, onConflict id (idempotent).
  let upserted = 0;
  for (const b of chunk(rows, DB_BATCH)) {
    const { error } = await supabase.from('kb_chunks').upsert(b, { onConflict: 'id' });
    if (error) throw new Error(`Upsert lỗi: ${error.message}`);
    upserted += b.length;
    process.stdout.write(`\r[ingest] upserted ${upserted}/${rows.length}`);
  }
  process.stdout.write('\n');

  const { count } = await supabase
    .from('kb_chunks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);
  console.log(`[ingest] xong. kb_chunks có embedding: ${count ?? '?'} (kỳ vọng ${rows.length}).`);
}

main().catch((err) => {
  console.error('[ingest] LỖI:', err.message);
  process.exit(1);
});
