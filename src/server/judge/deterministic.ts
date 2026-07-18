// Lớp A — kiểm tra tất định (KHÔNG LLM, tái lập 100%, KHÔNG tin client).
// Nguồn thẩm quyền = kb_rules (qua get_order_drafts) + get_safety_panel. Chỉ nêu FACT.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HardFinding, JudgeDecision } from "./types";

const isSevere = (s: string | null | undefined) => /severe|high|critical|nặng/i.test(s ?? "");

// Thủ thuật gây chảy máu → nêu lab đông máu/tiểu cầu (INR, PT, aPTT, tiểu cầu) như dữ kiện.
const BLEEDING_PROCS = new Set(["extraction", "implant", "biopsy", "root_canal"]);

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
    observations?: Array<{
      loinc_code: string; label_vi: string | null; category: string | null; unit: string | null;
      value_num: number | null; value_text: string | null; observed_at: string | null;
      ref_low: number | null; ref_high: number | null; related_flag: string | null;
    }>;
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

  // observation_fact: đính kèm GIÁ TRỊ lab liên quan (chỉ SỰ THẬT + ngày + tham chiếu, KHÔNG phán).
  // Nêu khi: (a) lab nhóm chảy máu + thủ thuật gây chảy máu, HOẶC (b) lab có related_flag khớp cờ nền BN.
  const flagLabels = (safety.systemic_flags ?? []).map((f) => (f.label ?? "").toLowerCase());
  const hasFlagFor = (rel: string | null) =>
    !!rel &&
    flagLabels.some(
      (l) =>
        l.includes(rel) ||
        (rel === "anticoagulant" && (l.includes("anticoag") || l.includes("antiplatelet"))) ||
        (rel === "diabetes" && l.includes("diabet")),
    );
  for (const o of safety.observations ?? []) {
    const bleedingRelevant = o.category === "bleeding" && BLEEDING_PROCS.has(procedureType);
    if (!bleedingRelevant && !hasFlagFor(o.related_flag)) continue;
    const val = o.value_num != null ? String(o.value_num) : (o.value_text ?? "—");
    const unit = o.unit ? ` ${o.unit}` : "";
    const ref =
      o.ref_low != null && o.ref_high != null
        ? ` (tham chiếu ${o.ref_low}–${o.ref_high})`
        : o.ref_high != null
          ? ` (tham chiếu ≤ ${o.ref_high})`
          : o.ref_low != null
            ? ` (tham chiếu ≥ ${o.ref_low})`
            : "";
    const when = o.observed_at ? ` đo ${o.observed_at}` : "";
    findings.push({
      type: "observation_fact",
      severity: "medium",
      message: `${o.label_vi ?? o.loinc_code}: ${val}${unit}${ref} —${when}. Dữ kiện đã ghi, bác sĩ diễn giải.`,
      ref: o.loinc_code,
    });
  }

  return findings;
}
