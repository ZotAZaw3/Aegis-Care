// Seed dữ liệu VẬN HÀNH demo để thấy luồng end-to-end (Tiếp đón→Khám→Y lệnh→Thực thi).
// Idempotent: tag '[DEMO]' → xóa (cascade) rồi tạo lại. KHÔNG đụng dữ liệu thật (không tag).
// Chạy: node scripts/seed-clinic-demo.mjs   (service key từ .dev.vars). Xóa sạch: --clear.
import { createClient } from "@supabase/supabase-js";
import { loadKbEnv } from "./_kb-env.mjs";

const { serviceKey, supabaseUrl } = loadKbEnv();
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const CLEAR_ONLY = process.argv.includes("--clear");
const TAG = "[DEMO]";

async function main() {
  // ---- Xóa demo cũ (cascade orders + lab_orders qua FK ON DELETE CASCADE) ----
  const { data: old } = await sb.from("visit_sessions").select("id").ilike("chief_complaint", `${TAG}%`);
  const oldIds = (old ?? []).map((v) => v.id);
  if (oldIds.length) {
    await sb.from("visit_sessions").delete().in("id", oldIds);
    console.log(`Đã xóa ${oldIds.length} ca demo cũ (cascade y lệnh/lab).`);
  }
  // dọn medical_orders/lab_orders demo còn sót (nếu ca đã xóa nhưng order lẻ)
  await sb.from("medical_orders").delete().ilike("title", `${TAG}%`);
  await sb.from("lab_orders").delete().ilike("test_name", `${TAG}%`);
  if (CLEAR_ONLY) { console.log("Đã dọn sạch demo (--clear)."); return; }

  // ---- Lấy 1 bác sĩ + bệnh nhân ----
  const { data: roleRow } = await sb.from("user_roles").select("user_id").eq("role", "dentist").limit(1).maybeSingle();
  let dentistStaffId = null;
  if (roleRow?.user_id) {
    const { data: st } = await sb.from("staff").select("id").eq("user_id", roleRow.user_id).maybeSingle();
    dentistStaffId = st?.id ?? null;
  }
  if (!dentistStaffId) {
    const { data: anyStaff } = await sb.from("staff").select("id").limit(1).maybeSingle();
    dentistStaffId = anyStaff?.id ?? null;
  }
  // BN dùng warfarin (để demo Compliance Judge chặn nhổ răng)
  const { data: warMed } = await sb.from("emr_medications").select("patient_id").ilike("description", "%warfarin%").is("med_stop", null).limit(1).maybeSingle();
  const warPid = warMed?.patient_id ?? null;
  // vài BN khác
  const { data: pats } = await sb.from("patients").select("id, full_name").neq("id", warPid ?? "00000000-0000-0000-0000-000000000000").limit(4);
  const P = (pats ?? []).map((p) => p.id);

  // ---- Tạo ca khám (hàng đợi + đang khám + đã xong) ----
  const visits = [
    { patient_id: P[0], status: "pending",  chief_complaint: `${TAG} Đau răng` },
    { patient_id: P[1], status: "pending",  chief_complaint: `${TAG} Cạo vôi định kỳ` },
    { patient_id: warPid ?? P[2], status: "in_exam", procedure_type: "extraction", assigned_dentist_id: dentistStaffId, chief_complaint: `${TAG} Nhổ răng (BN chống đông)` },
    { patient_id: P[2], status: "done",    procedure_type: "scaling",    assigned_dentist_id: dentistStaffId, closed_at: new Date().toISOString(), chief_complaint: `${TAG} Cạo vôi (đã xong)` },
  ].filter((v) => v.patient_id);

  const inserted = [];
  for (const v of visits) {
    const { data, error } = await sb.from("visit_sessions").insert(v).select("id, patient_id, status, session_number").single();
    if (error) { console.log("  lỗi tạo ca:", error.message); continue; }
    inserted.push(data);
  }
  console.log(`Đã tạo ${inserted.length} ca: ${inserted.map((v) => `#${v.session_number}(${v.status})`).join(" ")}`);

  const inExam = inserted.find((v) => v.status === "in_exam");
  if (inExam) {
    const now = Date.now();
    // Y lệnh routed cho trợ thủ (/execution) + awaiting_review cho bác sĩ (pending-review)
    await sb.from("medical_orders").insert([
      { visit_session_id: inExam.id, patient_id: inExam.patient_id, order_type: "imaging",   title: `${TAG} Chụp X-quang quanh chóp`, assigned_role: "assistant", status: "routed", ordered_by: dentistStaffId, due_at: new Date(now + 2 * 3600e3).toISOString() },
      { visit_session_id: inExam.id, patient_id: inExam.patient_id, order_type: "procedure", title: `${TAG} Nhổ răng khôn`,           assigned_role: "dentist",   status: "awaiting_review", ordered_by: dentistStaffId },
      { visit_session_id: inExam.id, patient_id: inExam.patient_id, order_type: "follow_up", title: `${TAG} Hẹn tái khám 7 ngày`,      assigned_role: "receptionist", status: "routed", ordered_by: dentistStaffId, due_at: new Date(now + 7 * 86400e3).toISOString() },
    ]);
    // Lab order (/lab)
    await sb.from("lab_orders").insert({ visit_session_id: inExam.id, test_name: `${TAG} INR trước nhổ răng`, status: "ordered", round_number: 1, ordered_by: dentistStaffId });
    console.log("Đã tạo 3 y lệnh (routed/awaiting_review) + 1 lab order cho ca đang khám.");
  }
  console.log("XONG. Đăng nhập để thấy luồng: /clinic (ca + chờ duyệt), /execution (y lệnh trợ thủ), /lab (xét nghiệm).");
}

main().catch((e) => { console.error(e); process.exit(1); });
