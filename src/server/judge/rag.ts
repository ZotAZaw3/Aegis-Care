// Lớp B (truy hồi) — embed câu truy vấn + kb_search (hybrid RRF). Trả chunks + tập id
// hợp lệ (allowed) để hậu-kiểm citation ở citation-guard. Không LLM ở đây.
import { embed } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";

const EMBED_MODEL = "text-embedding-3-small";

export interface Chunk {
  id: string;
  citation: string;
  page_start: number | null;
  content: string;
}

export async function retrieve(
  openai: OpenAIProvider,
  supabase: SupabaseClient,
  query: string,
): Promise<{ chunks: Chunk[]; allowed: Set<string> }> {
  const { embedding } = await embed({ model: openai.embedding(EMBED_MODEL), value: query });
  const { data, error } = await supabase.rpc("kb_search", {
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_k: 8,
  });
  if (error) return { chunks: [], allowed: new Set() };
  const chunks = (data ?? []) as Chunk[];
  return { chunks, allowed: new Set(chunks.map((c) => c.id)) };
}
