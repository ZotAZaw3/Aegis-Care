import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Inbox,
  AlertTriangle,
  Stethoscope,
  Users,
  FileSignature,
  PhoneCall,
  CalendarPlus,
  LayoutList,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ordersDb, currentStaffId } from "@/lib/orders";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const SEVERITY_RANK = { critical: 0, warning: 1, none: 2 } as const;
type Severity = keyof typeof SEVERITY_RANK;

export interface HomeSuggestion {
  id: string;
  icon: LucideIcon;
  severity: Severity;
  text: string;
  meta: string;
  roleLabel: string;
  isNew?: boolean;
  /** Shown as a stat-tile badge on the card; omitted for suggestions with no natural count. */
  count?: number;
  /** Canned conversational lines shown in the thread step before the redirect chip. */
  userLine: string;
  assistantLine: string;
  chipLabel: string;
  to?: { to: string; params?: Record<string, string> };
  openBooking?: boolean;
}

const HANGING_STATUSES = ["open", "routed", "in_progress", "awaiting_review"];

function bi(lang: string, vi: string, en: string) {
  return lang === "vi" ? vi : en;
}

export function useHomeSuggestions() {
  const { user, roles } = useAuth();
  const { lang } = useI18n();

  const isDentist = roles.includes("dentist");
  const isReceptionist = roles.includes("receptionist");
  const isAssistant = roles.includes("assistant");
  const isReceptionLike = isReceptionist || isAssistant;
  const isAdmin = roles.includes("admin");

  const { data: staffId } = useQuery({
    queryKey: ["current-staff-id", user?.id],
    queryFn: () => currentStaffId(user!.id),
    enabled: !!user,
  });

  const pendingReview = useQuery({
    queryKey: ["home-pending-review", staffId],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("pending_review_orders")
        .select("id, visit_session_id, opened_at")
        .eq("assigned_dentist_id", staffId!)
        .order("opened_at", { ascending: true });
      if (error) throw error;
      return (data as { id: string; visit_session_id: string }[]) ?? [];
    },
    enabled: isDentist && !!staffId,
  });

  const violationsMine = useQuery({
    queryKey: ["home-violations-mine", staffId],
    queryFn: async () => {
      const { data: mySessions, error: e1 } = await supabase
        .from("visit_sessions")
        .select("id")
        .eq("assigned_dentist_id", staffId!);
      if (e1) throw e1;
      const ids = (mySessions ?? []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data, error: e2 } = await ordersDb
        .from("order_violations")
        .select("id, visit_session_id, due_at")
        .in("visit_session_id", ids)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (e2) throw e2;
      return (data as { id: string; visit_session_id: string }[]) ?? [];
    },
    enabled: isDentist && !!staffId,
  });

  const inExamCase = useQuery({
    queryKey: ["home-in-exam-case", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, patients(full_name)")
        .eq("status", "in_exam")
        .eq("assigned_dentist_id", staffId!)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data as any[])?.[0] ?? null;
    },
    enabled: isDentist && !!staffId,
  });

  const waiting = useQuery({
    queryKey: ["home-waiting"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("visit_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: isReceptionLike,
  });

  const consent = useQuery({
    queryKey: ["home-consent"],
    queryFn: async () => {
      const { count, error } = await ordersDb
        .from("medical_orders")
        .select("id", { count: "exact", head: true })
        .eq("order_type", "consent")
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: isReceptionLike,
  });

  const recall = useQuery({
    queryKey: ["home-recall"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("medical_orders")
        .select("id, due_at")
        .eq("order_type", "follow_up")
        .in("status", ["open", "routed", "in_progress"]);
      if (error) throw error;
      const rows = (data as { id: string; due_at: string | null }[]) ?? [];
      const overdue = rows.filter((r) => r.due_at && new Date(r.due_at) < new Date()).length;
      return { total: rows.length, overdue };
    },
    enabled: isReceptionist,
  });

  const nextPatient = useQuery({
    queryKey: ["home-next-patient"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, patient_id, patients(full_name)")
        .in("status", ["called", "in_exam"])
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data as any[])?.[0] ?? null;
    },
    enabled: isAssistant,
  });

  const openCases = useQuery({
    queryKey: ["home-open-cases"],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from("visit_sessions")
        .select("id, session_number")
        .not("status", "in", "(done,transferred)")
        .order("session_number", { ascending: true });
      if (error) throw error;
      const rows = sessions ?? [];
      if (rows.length === 0) return { sessions: 0, hanging: 0, topSessionId: null as string | null };
      const { data: orders, error: e2 } = await ordersDb
        .from("medical_orders")
        .select("visit_session_id, status")
        .in(
          "visit_session_id",
          rows.map((s: any) => s.id),
        )
        .in("status", HANGING_STATUSES);
      if (e2) throw e2;
      const counts: Record<string, number> = {};
      (orders ?? []).forEach((o: any) => {
        counts[o.visit_session_id] = (counts[o.visit_session_id] ?? 0) + 1;
      });
      let topSessionId = rows[0].id as string;
      let topCount = 0;
      rows.forEach((s: any) => {
        const c = counts[s.id] ?? 0;
        if (c > topCount) {
          topCount = c;
          topSessionId = s.id;
        }
      });
      const hanging = Object.values(counts).reduce((a: number, b: number) => a + b, 0);
      return { sessions: rows.length, hanging, topSessionId };
    },
    enabled: isAdmin,
  });

  const violationsAll = useQuery({
    queryKey: ["home-violations-all"],
    queryFn: async () => {
      const { data, error } = await ordersDb.from("order_violations").select("id, visit_session_id").limit(200);
      if (error) throw error;
      return (data as { id: string; visit_session_id: string }[]) ?? [];
    },
    enabled: isAdmin,
  });

  const staffWithoutRole = useQuery({
    queryKey: ["home-staff-without-role"],
    queryFn: async () => {
      const [staffRes, rolesRes] = await Promise.all([
        supabase.from("staff").select("id, user_id"),
        supabase.from("user_roles").select("user_id"),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const withRole = new Set((rolesRes.data ?? []).map((r: any) => r.user_id));
      return (staffRes.data ?? []).filter((s: any) => !withRole.has(s.user_id)).length;
    },
    enabled: isAdmin,
  });

  return useMemo(() => {
    const roleLabel = (r: "dentist" | "receptionist" | "assistant" | "admin") =>
      ({
        dentist: bi(lang, "Nha sĩ", "Dentist"),
        receptionist: bi(lang, "Lễ tân", "Reception"),
        assistant: bi(lang, "Trợ lý nha khoa", "Assistant"),
        admin: bi(lang, "Quản trị", "Admin"),
      })[r];

    const list: HomeSuggestion[] = [];

    if (isDentist && pendingReview.data && pendingReview.data.length > 0) {
      const n = pendingReview.data.length;
      list.push({
        id: "dentist-pending-review",
        icon: Inbox,
        severity: "none",
        count: n,
        text: bi(lang, `${n} y lệnh đang chờ bạn duyệt`, `${n} orders awaiting your review`),
        meta: bi(lang, "Từ hàng chờ duyệt", "From the review queue"),
        roleLabel: roleLabel("dentist"),
        userLine: bi(lang, `Cho tôi xem ${n} y lệnh đang chờ duyệt`, `Show me the ${n} orders awaiting review`),
        assistantLine: bi(
          lang,
          `Có ${n} y lệnh đã hoàn tất, đang chờ bạn duyệt để đóng.`,
          `${n} orders are completed and waiting for your review to close them out.`,
        ),
        chipLabel: bi(lang, "Mở hàng chờ duyệt", "Open the review queue"),
        to: { to: "/visits/$id", params: { id: pendingReview.data[0].visit_session_id } },
      });
    }

    if (isDentist && violationsMine.data && violationsMine.data.length > 0) {
      const n = violationsMine.data.length;
      list.push({
        id: "dentist-violations",
        icon: AlertTriangle,
        severity: "critical",
        count: n,
        text: bi(lang, `${n} y lệnh quá hạn / thiếu consent`, `${n} orders overdue or missing consent`),
        meta: bi(lang, "Cần xử lý sớm", "Needs attention soon"),
        roleLabel: roleLabel("dentist"),
        userLine: bi(lang, "Có y lệnh nào đang vi phạm không?", "Are any of my orders in violation?"),
        assistantLine: bi(
          lang,
          `${n} y lệnh đang vi phạm — quá hạn hoặc thiếu cam kết đồng thuận. Cần xử lý sớm.`,
          `${n} orders are in violation — overdue or missing consent. These need attention soon.`,
        ),
        chipLabel: bi(lang, "Xem chi tiết vi phạm", "View the violation details"),
        to: { to: "/visits/$id", params: { id: violationsMine.data[0].visit_session_id } },
      });
    }

    if (isDentist && inExamCase.data) {
      const p = Array.isArray(inExamCase.data.patients) ? inExamCase.data.patients[0] : inExamCase.data.patients;
      const name = p?.full_name ?? bi(lang, "Bệnh nhân", "Patient");
      list.push({
        id: "dentist-in-exam",
        icon: Stethoscope,
        severity: "none",
        text: bi(lang, `${name} đang chờ khám — tạo y lệnh?`, `${name} is in exam — draft orders?`),
        meta: bi(lang, "Đang khám", "In exam"),
        roleLabel: roleLabel("dentist"),
        userLine: bi(lang, `Tạo y lệnh cho ${name}`, `Draft orders for ${name}`),
        assistantLine: bi(
          lang,
          `${name} đang ở phòng khám, chưa có y lệnh nào cho phiên này. Đây là nháp gợi ý theo loại thủ thuật đã ghi nhận.`,
          `${name} is currently in exam with no orders drafted yet for this visit. Here's a suggested draft based on the recorded procedure type.`,
        ),
        chipLabel: bi(lang, "Mở nháp y lệnh", "Open the order draft"),
        to: { to: "/visits/$id", params: { id: inExamCase.data.id } },
      });
    }

    if (isReceptionLike && (waiting.data ?? 0) > 0) {
      const n = waiting.data ?? 0;
      list.push({
        id: "waiting",
        icon: Users,
        severity: "none",
        count: n,
        text: bi(lang, `${n} bệnh nhân đang chờ check-in xử lý`, `${n} patients waiting to be seen`),
        meta: bi(lang, "Hàng đợi walk-in", "Walk-in queue"),
        roleLabel: roleLabel(isReceptionist ? "receptionist" : "assistant"),
        userLine: bi(lang, "Cho tôi xem hàng chờ hiện tại", "Show me the current queue"),
        assistantLine: bi(lang, `${n} bệnh nhân đang ở trạng thái chờ.`, `${n} patients are currently waiting.`),
        chipLabel: bi(lang, "Mở bảng tiếp đón", "Open the reception board"),
        to: { to: "/reception" },
      });
    }

    if (isReceptionLike && (consent.data ?? 0) > 0) {
      const n = consent.data ?? 0;
      list.push({
        id: "consent",
        icon: FileSignature,
        severity: "warning",
        count: n,
        text: bi(lang, `${n} phiếu đồng thuận chờ ký`, `${n} consent forms awaiting signature`),
        meta: bi(lang, "Trước khi vào thủ thuật", "Before the procedure"),
        roleLabel: roleLabel(isReceptionist ? "receptionist" : "assistant"),
        userLine: bi(lang, "Có phiếu đồng thuận nào cần ký không?", "Any consent forms that need signing?"),
        assistantLine: bi(
          lang,
          `${n} phiếu đang chờ ký trước khi vào thủ thuật.`,
          `${n} forms are waiting to be signed before the procedure.`,
        ),
        chipLabel: bi(lang, "Mở phiếu đồng thuận", "Open the consent queue"),
        to: { to: "/reception" },
      });
    }

    if (isReceptionist && recall.data && recall.data.total > 0) {
      const overdueSuffixVi = recall.data.overdue > 0 ? ` (${recall.data.overdue} quá hạn)` : "";
      const overdueSuffixEn = recall.data.overdue > 0 ? ` (${recall.data.overdue} overdue)` : "";
      list.push({
        id: "recall",
        icon: PhoneCall,
        severity: recall.data.overdue > 0 ? "warning" : "none",
        count: recall.data.total,
        text: bi(
          lang,
          `${recall.data.total} bệnh nhân cần gọi nhắc tái khám${overdueSuffixVi}`,
          `${recall.data.total} patients need a recall call${overdueSuffixEn}`,
        ),
        meta: bi(lang, "Hàng chờ tái khám", "Recall queue"),
        roleLabel: roleLabel("receptionist"),
        userLine: bi(lang, "Ai cần gọi nhắc tái khám hôm nay?", "Who needs a recall call today?"),
        assistantLine: bi(
          lang,
          `${recall.data.total} bệnh nhân trong hàng chờ tái khám${overdueSuffixVi}.`,
          `${recall.data.total} patients are in the recall queue${overdueSuffixEn}.`,
        ),
        chipLabel: bi(lang, "Mở hàng chờ tái khám", "Open the recall queue"),
        to: { to: "/follow-ups" },
      });
    }

    if (isReceptionist) {
      list.push({
        id: "booking-stub",
        icon: CalendarPlus,
        severity: "none",
        text: bi(lang, "Đặt lịch hẹn cho bệnh nhân mới", "Book an appointment for a new patient"),
        meta: bi(lang, "Tính năng mới", "New feature"),
        roleLabel: roleLabel("receptionist"),
        isNew: true,
        userLine: bi(lang, "Đặt lịch hẹn cho bệnh nhân mới", "Book an appointment for a new patient"),
        assistantLine: bi(
          lang,
          "Đây là giao diện đặt lịch đang thiết kế — chọn bệnh nhân, ngày và khung giờ trống bên dưới.",
          "Here's the appointment-booking UI in progress — pick a patient, date, and open slot below.",
        ),
        chipLabel: bi(lang, "Mở form đặt lịch", "Open the booking form"),
        openBooking: true,
      });
    }

    if (isAssistant && nextPatient.data) {
      const p = Array.isArray(nextPatient.data.patients) ? nextPatient.data.patients[0] : nextPatient.data.patients;
      const name = p?.full_name ?? bi(lang, "bệnh nhân tiếp theo", "the next patient");
      list.push({
        id: "assistant-next-patient",
        icon: UserCheck,
        severity: "none",
        text: bi(lang, `Chuẩn bị hồ sơ cho ca khám tiếp theo — ${name}`, `Prep the chart for the next patient — ${name}`),
        meta: bi(lang, "Ca tiếp theo", "Next up"),
        roleLabel: roleLabel("assistant"),
        userLine: bi(lang, `Chuẩn bị hồ sơ cho ${name}`, `Prep the chart for ${name}`),
        assistantLine: bi(
          lang,
          `${name} là ca tiếp theo. Đây là hồ sơ và lưu ý an toàn trước khi vào phòng khám.`,
          `${name} is up next. Here's their chart and safety notes before they go into the room.`,
        ),
        chipLabel: bi(lang, "Mở hồ sơ bệnh nhân", "Open the patient chart"),
        to: { to: "/patients/$id", params: { id: nextPatient.data.patient_id } },
      });
    }

    if (isAdmin && openCases.data && openCases.data.sessions > 0 && openCases.data.topSessionId) {
      list.push({
        id: "admin-open-cases",
        icon: LayoutList,
        severity: openCases.data.hanging > 0 ? "warning" : "none",
        text: bi(
          lang,
          `${openCases.data.sessions} ca đang mở, ${openCases.data.hanging} y lệnh đang treo`,
          `${openCases.data.sessions} open cases, ${openCases.data.hanging} orders hanging`,
        ),
        meta: bi(lang, "Toàn phòng khám", "Clinic-wide"),
        roleLabel: roleLabel("admin"),
        userLine: bi(lang, "Tình hình các ca đang mở thế nào?", "What's the status of open cases?"),
        assistantLine: bi(
          lang,
          `${openCases.data.sessions} ca đang mở toàn phòng khám, ${openCases.data.hanging} y lệnh đang treo.`,
          `${openCases.data.sessions} cases are open clinic-wide, with ${openCases.data.hanging} orders hanging.`,
        ),
        chipLabel: bi(lang, "Mở ca cần chú ý", "Open the case that needs attention"),
        to: { to: "/visits/$id", params: { id: openCases.data.topSessionId } },
      });
    }

    if (isAdmin && violationsAll.data && violationsAll.data.length > 0) {
      const n = violationsAll.data.length;
      list.push({
        id: "admin-violations",
        icon: AlertTriangle,
        severity: "critical",
        count: n,
        text: bi(lang, `${n} vi phạm quy trình toàn phòng khám cần xử lý`, `${n} process violations across the clinic`),
        meta: bi(lang, "Quá hạn / thiếu consent", "Overdue / missing consent"),
        roleLabel: roleLabel("admin"),
        userLine: bi(lang, "Có bao nhiêu vi phạm quy trình đang mở?", "How many open process violations are there?"),
        assistantLine: bi(
          lang,
          `${n} vi phạm đang mở toàn phòng khám — quá hạn hoặc thiếu consent. Cần xử lý.`,
          `${n} violations are open clinic-wide — overdue or missing consent. These need handling.`,
        ),
        chipLabel: bi(lang, "Xem danh sách vi phạm", "View the violation list"),
        to: { to: "/visits/$id", params: { id: violationsAll.data[0].visit_session_id } },
      });
    }

    if (isAdmin && (staffWithoutRole.data ?? 0) > 0) {
      const n = staffWithoutRole.data ?? 0;
      list.push({
        id: "admin-staff-role",
        icon: ShieldAlert,
        severity: "warning",
        count: n,
        text: bi(lang, `${n} nhân viên chưa được gán vai trò`, `${n} staff members have no assigned role`),
        meta: bi(lang, "Quản lý nhân sự", "Staff management"),
        roleLabel: roleLabel("admin"),
        userLine: bi(lang, "Nhân viên nào chưa được gán vai trò?", "Which staff members have no role assigned?"),
        assistantLine: bi(
          lang,
          `${n} tài khoản nhân viên chưa có vai trò — cần gán trước khi họ dùng được các chức năng nghiệp vụ.`,
          `${n} staff accounts have no role yet — they need one assigned before they can use the operational features.`,
        ),
        chipLabel: bi(lang, "Mở quản lý nhân sự", "Open staff management"),
        to: { to: "/admin" },
      });
    }

    list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    return { all: list };
  }, [
    lang,
    isDentist,
    isReceptionist,
    isAssistant,
    isReceptionLike,
    isAdmin,
    pendingReview.data,
    violationsMine.data,
    inExamCase.data,
    waiting.data,
    consent.data,
    recall.data,
    nextPatient.data,
    openCases.data,
    violationsAll.data,
    staffWithoutRole.data,
  ]);
}
