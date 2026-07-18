import { supabase } from "@/integrations/supabase/client";
import { ordersDb } from "@/lib/orders";

export type ConsentSigner = "patient" | "guardian";
const CONSENT_BUCKET = "consent-scans";

export interface ConsentInput {
  signer: ConsentSigner;
  signedDate: string; // yyyy-mm-dd
  scanFile: File;
}

/**
 * Persist a signed consent scan then link it as evidence on the consent gate
 * order. The DB auto_close_on_evidence → consent_gate_ok trigger closes the gate
 * when all four conditions hold; we re-fetch and return the resulting status so
 * the UI can tell the user whether the gate actually closed.
 */
export async function submitConsent(
  consentOrderId: string,
  { signer, signedDate, scanFile }: ConsentInput,
  staffId: string,
): Promise<string> {
  const scanPath = `${consentOrderId}/${Date.now()}-${scanFile.name}`;
  const { error: upErr } = await supabase.storage.from(CONSENT_BUCKET).upload(scanPath, scanFile);
  if (upErr) throw upErr;

  const { data: consent, error: cErr } = await ordersDb
    .from("consents")
    .insert({ order_id: consentOrderId, scan_path: scanPath, signer, signed_date: signedDate })
    .select("id")
    .single();
  if (cErr) throw cErr;

  const { error: evErr } = await ordersDb.from("order_evidence").insert({
    order_id: consentOrderId,
    evidence_type: "consent_scan",
    file_path: scanPath,
    consent_id: consent?.id ?? null,
    submitted_by: staffId,
  });
  if (evErr) throw evErr;

  const { data: order } = await ordersDb
    .from("medical_orders")
    .select("status")
    .eq("id", consentOrderId)
    .single();
  return (order?.status as string) ?? "open";
}

/** Age in whole years at a reference date. */
function ageAt(dob: string, at: string): number {
  const b = new Date(dob);
  const ref = new Date(at);
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
  return age;
}

/**
 * Client-side pre-check mirroring the DB gate conditions purely for UX feedback.
 * Returns an i18n key describing why the gate would NOT close, or null if the
 * inputs look valid. The real decision is enforced by the DB trigger.
 */
export function explainGate(
  parentOpenedAt: string | null,
  patientDob: string | null,
  signer: ConsentSigner,
  signedDate: string,
): string | null {
  if (!signedDate) return "gate_open_reason";
  const today = new Date().toISOString().slice(0, 10);
  if (parentOpenedAt && signedDate < parentOpenedAt.slice(0, 10)) return "reason_signed_before";
  if (signedDate > today) return "reason_future_date";
  if (patientDob && ageAt(patientDob, signedDate) < 18 && signer !== "guardian") return "reason_minor_guardian";
  return null;
}
