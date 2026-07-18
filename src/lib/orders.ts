import { supabase } from "@/integrations/supabase/client";

// ---- Local shapes for tables/RPCs missing from stale generated types ----

export interface SafetyAllergy { label: string; severity: string | null; note: string | null; source: string | null; }
export interface SafetyMedication { name: string; rxnorm: string | null; }
export interface SafetyFlag { label_vi: string | null; label: string; severity_hint: string | null; matched_by: string | null; }
export interface ObservationFact {
  loinc_code: string;
  label_vi: string | null;
  category: string | null;
  unit: string | null;
  value_num: number | null;
  value_text: string | null;
  observed_at: string | null;
  ref_low: number | null;
  ref_high: number | null;
  related_flag: string | null;
  relevance_vi: string | null;
}
export interface SafetyPanel {
  allergies: SafetyAllergy[];
  medications: SafetyMedication[];
  systemic_flags: SafetyFlag[];
  observations: ObservationFact[];
}

export interface CrmFollowup { id: string; title: string; due_at: string | null; status: string | null; }
export interface CrmProcedure { code: string; description: string | null; performed_at: string | null; }
export interface CrmRecall {
  last_dental_encounter: string | null;
  open_followups: CrmFollowup[];
  dental_procedures: CrmProcedure[];
}

export type OrderType = "imaging" | "lab" | "procedure" | "medication" | "follow_up" | "referral" | "consent";

export interface OrderDraft {
  id: string;
  procedure_type: string;
  order_type: OrderType;
  title: string;
  title_vi: string | null;
  detail: string | null;
  assigned_role: string;
  mandatory: boolean;
  requires_consent: boolean;
  needs_review: boolean;
  close_mode: string;
  due_offset_hours: number | null;
  sort_order: number;
}

export interface BriefingSentence { text: string; encounter_ids: string[]; verbatim_span: string | null; }
export interface Briefing {
  summary_sentences: BriefingSentence[];
  caveats: string[];
  source_encounter_count: number;
}

export interface ActiveOrder {
  id: string;
  visit_session_id: string;
  patient_id: string;
  parent_order_id: string | null;
  order_type: OrderType;
  procedure_type: string | null;
  title: string;
  detail: string | null;
  assigned_role: string | null;
  status: string;
  close_mode: string | null;
  due_at: string | null;
  opened_at: string | null;
  closed_at: string | null;
  is_kb_mandatory: boolean | null;
}

export interface PendingReviewOrder {
  id: string;
  title: string;
  order_type: OrderType;
  status: string;
  assigned_dentist_id: string | null;
  visit_session_id: string;
  due_at: string | null;
}

// A draft plus the dentist's decision in the workspace.
export interface DraftDecision {
  draft: OrderDraft;
  keep: boolean;
  exceptionReason?: string;
}

export const PROCEDURE_TYPES = [
  "implant", "extraction", "root_canal", "scaling", "filling", "biopsy",
] as const;

/** Resolve the staff row id for the signed-in auth user. */
export async function currentStaffId(userId: string): Promise<string | undefined> {
  const res = await supabase.from("staff").select("id").eq("user_id", userId).single();
  return (res.data?.id as string | undefined) ?? undefined;
}

interface InsertArgs {
  sessionId: string;
  patientId: string;
  procedureType: string;
  decisions: DraftDecision[];
  staffId: string;
}

// Table columns are not in the stale generated types → cast the client.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/**
 * Persist the dentist-signed order set. Kept orders become open medical_orders
 * (the DB route_order trigger sets routed status + due_at). Procedure orders
 * requiring consent get a child consent gate. Dropped mandatory steps are
 * recorded as cancelled rows with a reason for audit.
 */
export async function insertSignedOrders({ sessionId, patientId, procedureType, decisions, staffId }: InsertArgs) {
  const table = () => db.from("medical_orders");

  for (const { draft, keep, exceptionReason } of decisions) {
    if (!keep) {
      if (!draft.mandatory) continue; // non-mandatory dropped → nothing to record
      // Mandatory step skipped: audit trail requires a cancel reason.
      const reason = (exceptionReason ?? "").trim();
      if (!reason) throw new Error(`Missing exception reason for "${draft.title_vi ?? draft.title}"`);
      const { error } = await table().insert({
        visit_session_id: sessionId,
        patient_id: patientId,
        order_type: draft.order_type,
        procedure_type: draft.order_type === "procedure" || draft.order_type === "consent" ? procedureType : null,
        title: draft.title_vi ?? draft.title,
        detail: draft.detail,
        ordered_by: staffId,
        assigned_role: draft.assigned_role,
        close_mode: draft.close_mode,
        kb_rule_id: draft.id,
        is_kb_mandatory: true,
        status: "cancelled",
        cancel_reason: reason,
        cancelled_by: staffId,
      });
      if (error) throw error;
      continue;
    }

    const isProcedure = draft.order_type === "procedure";
    const row = {
      visit_session_id: sessionId,
      patient_id: patientId,
      order_type: draft.order_type,
      procedure_type: isProcedure || draft.order_type === "consent" ? procedureType : null,
      title: draft.title_vi ?? draft.title,
      detail: draft.detail,
      ordered_by: staffId,
      assigned_role: draft.assigned_role,
      close_mode: draft.close_mode,
      kb_rule_id: draft.id,
      is_kb_mandatory: draft.mandatory,
      status: "open",
    };

    if (!isProcedure) {
      const { error } = await table().insert(row);
      if (error) throw error;
      continue;
    }

    // Procedure order: capture id so an optional consent gate can be parented.
    const { data, error } = await table().insert(row).select("id").single();
    if (error) throw error;
    if (draft.requires_consent && data?.id) {
      const { error: consentErr } = await table().insert({
        visit_session_id: sessionId,
        patient_id: patientId,
        parent_order_id: data.id,
        order_type: "consent",
        procedure_type: procedureType,
        title: `Cam kết: ${draft.title_vi ?? draft.title}`,
        ordered_by: staffId,
        assigned_role: "receptionist",
        close_mode: "evidence",
        status: "open",
      });
      if (consentErr) throw consentErr;
    }
  }
}

export { db as ordersDb };
