// Lớp A — kiểm tra tất định (KHÔNG LLM, tái lập 100%, KHÔNG tin client).
// Nguồn thẩm quyền = kb_rules (qua get_order_drafts) + get_safety_panel. Chỉ nêu FACT.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HardFinding, JudgeDecision } from "./types";

const isSevere = (s: string | null | undefined) => /severe|high|critical|nặng/i.test(s ?? "");

interface Args {
  patientId: string;
  procedureType: string;
  decisions: JudgeDecision[];
}

export async function runDeterministic(
  supabase: SupabaseClient,
  { patientId, procedureType, decisions }: Args,
): Promise<HardFinding[]> {
  const findings: HardFinding[] = [];
  const decByRule = new Map(decisions.map((d) => [d.rule_id, d]));

  // Lấy danh sách chuẩn từ DB (không tin client) + panel an toàn.
  const [draftsRes, safetyRes] = await Promise.all([
    supabase.rpc("get_order_drafts", { p_procedure_type: procedureType }),
    supabase.rpc("get_safety_panel", { p_patient_id: patientId }),
  ]);
  // Lớp A là tầng THẨM QUYỀN "luôn chạy" — RPC lỗi thì KHÔNG được âm thầm trả rỗng
  // (sẽ thành verdict 'clean' giả). Ném lỗi để route chặn ký, buộc bác sĩ thử lại.
  if (draftsRes.error) throw new Error(`get_order_drafts: ${draftsRes.error.message}`);
  if (safetyRes.error) throw new Error(`get_safety_panel: ${safetyRes.error.message}`);

  // missing_mandatory: rule bắt buộc bị bỏ mà KHÔNG có lý do.
  for (const d of (draftsRes.data ?? []) as Array<Record<string, unknown>>) {
    if (!d.mandatory) continue;
    const dec = decByRule.get(d.id as string);
    const dropped = dec?.keep === false;
    const hasReason = !!dec?.reason && dec.reason.trim().length > 0;
    if (dropped && !hasReason) {
      findings.push({
        type: "missing_mandatory",
        severity: "high",
        message: `Bước bắt buộc bị bỏ chưa có lý do: ${(d.title_vi as string) ?? (d.title as string)}`,
        ref: d.id as string,
      });
    }
  }

  const safety = (safetyRes.data ?? {}) as {
    systemic_flags?: Array<{ label_vi: string | null; label: string; severity_hint: string | null }>;
    allergies?: Array<{ label: string; severity: string | null }>;
  };

  // safety_flag: chỉ nêu SỰ THẬT bệnh nhân có cờ X — KHÔNG phán "nên/cấm".
  for (const f of safety.systemic_flags ?? []) {
    findings.push({
      type: "safety_flag",
      severity: isSevere(f.severity_hint) ? "high" : "medium",
      message: `Bệnh nhân có cờ bệnh nền: ${f.label_vi ?? f.label} — dữ kiện đã ghi, đối chiếu panel an toàn.`,
      ref: f.label,
    });
  }
  for (const a of safety.allergies ?? []) {
    if (isSevere(a.severity)) {
      findings.push({
        type: "safety_flag",
        severity: "high",
        message: `Dị ứng nặng đã ghi: ${a.label} — đối chiếu panel an toàn.`,
        ref: a.label,
      });
    }
  }

  return findings;
}
