// Phase C — Eval retrieval trên pgvector (port từ services/rag-ingest/eval_retrieval.py).
// Với mỗi query: embed (OpenAI) -> rpc kb_search -> check expect_any trong citation.
// Đo Hit@5, in bảng so sánh. Bao gồm 1 câu "ngoài phạm vi" (kỳ vọng điểm thấp).
// Chạy: node scripts/eval-kb-retrieval.mjs   (cần ingest xong trước).
import { createClient } from '@supabase/supabase-js';
import { loadKbEnv, embedBatch, isMissingTableError } from './_kb-env.mjs';

const TOP_K = 5;

// Bộ câu hỏi tay + từ khóa kỳ vọng (khớp bản gốc eval_retrieval.py).
const EVAL_SET = [
  { query: 'Bảo hiểm y tế có chi trả cho răng giả không?', expect_any: ['Điều 23', '51/2024'] },
  { query: 'Người bệnh có quyền được giữ bí mật thông tin hồ sơ bệnh án không?', expect_any: ['Điều 10', '15/2023'] },
  { query: 'Người hành nghề phải làm gì khi xảy ra sự cố y khoa?', expect_any: ['sự cố y khoa', '15/2023'] },
  { query: 'Mức hưởng bảo hiểm y tế đối với người nghèo là bao nhiêu?', expect_any: ['Điều 22', '51/2024', 'mức hưởng'] },
  { query: 'Quy trình giám định chi phí khám chữa bệnh bảo hiểm y tế', expect_any: ['giám định', '12/2026'] },
  { query: 'Danh mục bệnh cần chữa trị dài ngày dùng mã gì?', expect_any: ['ICD-10', '25/2025', 'dài ngày'] },
  { query: 'Bệnh viện Răng Hàm Mặt Trung ương có nhiệm vụ gì?', expect_any: ['2772', 'nhiệm vụ'] },
  { query: 'Quy định về đăng ký xe máy khi tham gia giao thông', expect_any: null }, // ngoài phạm vi
];

async function main() {
  const { openaiKey, serviceKey, supabaseUrl } = loadKbEnv();
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Pre-flight: đã ingest chưa? (select thật + count để lộ missing-table và đếm rows)
  const probe = await supabase.from('kb_chunks').select('id', { count: 'exact' }).limit(1);
  if (probe.error && isMissingTableError(probe.error)) {
    console.log('[eval] kb_chunks chưa tồn tại — dán migration + chạy ingest trước.');
    return;
  }
  if (probe.error) throw new Error(`Supabase probe lỗi: ${probe.error.message}`);
  if (!probe.count) {
    console.log('[eval] kb_chunks rỗng — chạy scripts/ingest-kb-chunks.mjs trước.');
    return;
  }

  const queries = EVAL_SET.map((e) => e.query);
  const vectors = await embedBatch(queries, openaiKey);

  let nHit = 0;
  let nCheckable = 0;
  for (let i = 0; i < EVAL_SET.length; i++) {
    const item = EVAL_SET[i];
    const { data, error } = await supabase.rpc('kb_search', {
      p_query: item.query,
      p_embedding: JSON.stringify(vectors[i]),
      p_k: TOP_K,
    });
    if (error) throw new Error(`kb_search lỗi: ${error.message}`);
    const results = data || [];
    const topCitations = results.map((r) => r.citation).join(' | ');
    const topScore = results.length ? Number(results[0].score) : 0;

    console.log('\n' + '='.repeat(80));
    console.log('QUERY:', item.query);
    for (const r of results.slice(0, 3)) {
      console.log(`  [${Number(r.score).toFixed(4)}] ${r.citation} (trang ${r.page_start})`);
    }

    if (item.expect_any === null) {
      // RRF score tuyệt đối nhỏ (~1/61*2); dùng ngưỡng tương đối: cảnh báo nếu có match FTS mạnh.
      console.log(`  -> Câu 'ngoài phạm vi': top_score=${topScore.toFixed(4)} (kỳ vọng không có citation liên quan rõ)`);
      continue;
    }
    nCheckable++;
    const hit = item.expect_any.some((kw) => topCitations.toLowerCase().includes(kw.toLowerCase()));
    nHit += hit ? 1 : 0;
    console.log(`  -> ${hit ? 'HIT' : 'MISS'} (kỳ vọng 1 trong ${JSON.stringify(item.expect_any)})`);
  }

  const pct = nCheckable ? Math.round((nHit / nCheckable) * 100) : 0;
  console.log(`\n===== Hit@${TOP_K}: ${nHit}/${nCheckable} (${pct}%) =====`);
}

main().catch((err) => {
  console.error('[eval] LỖI:', err.message);
  process.exit(1);
});
