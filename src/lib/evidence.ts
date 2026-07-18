import { supabase } from "@/integrations/supabase/client";
import { ordersDb } from "@/lib/orders";

export type EvidenceType = "file_upload" | "record" | "manual_tick" | "consent_scan" | "appointment";

const EVIDENCE_BUCKET = "order-evidence";

/**
 * Upload a file (or attach a record note) as evidence for an order. When a file
 * is provided it is stored first; if the storage upload fails we throw and never
 * write the DB row so we don't leave a dangling evidence record.
 */
export async function uploadEvidence(
  orderId: string,
  file: File | null,
  evidenceType: EvidenceType,
  staffId: string,
  note?: string,
): Promise<void> {
  let filePath: string | null = null;
  if (file) {
    filePath = `${orderId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(EVIDENCE_BUCKET).upload(filePath, file);
    if (upErr) throw upErr;
  }
  const { error } = await ordersDb.from("order_evidence").insert({
    order_id: orderId,
    evidence_type: evidenceType,
    file_path: filePath,
    submitted_by: staffId,
    note: note ?? null,
  });
  if (error) throw error;
}

/**
 * Manual-close path: record a manual_tick evidence row, then move the order to
 * awaiting_review so it reaches the dentist. The evidence trigger only auto-closes
 * close_mode='evidence' orders, so manual orders are advanced explicitly here.
 */
export async function markManualDone(orderId: string, staffId: string, note?: string): Promise<void> {
  const { error: evErr } = await ordersDb.from("order_evidence").insert({
    order_id: orderId,
    evidence_type: "manual_tick",
    file_path: null,
    submitted_by: staffId,
    note: note ?? null,
  });
  if (evErr) throw evErr;
  const { error } = await ordersDb
    .from("medical_orders")
    .update({ status: "awaiting_review" })
    .eq("id", orderId);
  if (error) throw error;
}

/** Short-lived signed URL for a stored evidence/scan file. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
