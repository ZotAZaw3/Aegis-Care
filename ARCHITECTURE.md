# Aegis Care — Architecture (order-centric)

Hệ thống vận hành phòng khám nha khoa lấy **y lệnh (medical order)** làm vật thể trục.
Thay cho model rounds/lab/checklist trước đây (xem "Legacy" ở cuối). Nguồn thiết kế:
`plans/20260717-brainstorm-clinic-order-compliance-system/brainstorm-report.md` (authoritative).

Nguyên tắc: **Human-first, agent-support · Retrieval KHÔNG inference · Deterministic-first · KHÔNG compliance_score.**

## Stack
- **Frontend:** React 19 + TanStack Router/Start (file-based, SSR shell) + TanStack Query, Tailwind 4 + shadcn/ui.
- **Backend:** Supabase (Postgres + Auth + Realtime), gọi trực tiếp từ client; business logic ở route components hoặc Postgres functions/triggers.
- **AI:** 1 Edge Function `briefing` gọi OpenAI `gpt-4o-mini` (tạm; đổi Anthropic chỉ thay endpoint/model/key) — retrieval-only, chỉ ở Lane2.
- **i18n:** dictionary phẳng `vi`/`en` trong `src/lib/i18n.tsx` — mọi label là key có đủ 2 ngôn ngữ.
- **Lovable:** repo sync branch `main` về editor Lovable. Migration áp qua Supabase SQL Editor.

## Roles (4 vai)
| Role | VN | Việc trong luồng |
|---|---|---|
| `receptionist` | Lễ tân | Check-in (số 0-999/bed), scan consent đóng gate, hàng đợi recall |
| `assistant` | Trợ thủ | Thực thi y lệnh (imaging/lab), nạp bằng chứng |
| `dentist` | Bác sĩ | Đọc panel bối cảnh, viết/ký y lệnh, xem "chờ tôi xem" |
| `admin` | Quản trị | Toàn quyền + gán vai; dashboard vi phạm |

`user_roles` (1..n dòng/user); `is_staff()`/`has_role()` là SQL SECURITY DEFINER dùng trong RLS.
Đa số bảng RLS blanket "any authenticated staff"; `kb_rules`/`nka_systemic_flags`/`dental_snomed_whitelist` admin-gated write. Role gating chi tiết ở UI.

## Data model (trục = medical_orders)

- **`medical_orders`** — y lệnh, vật thể trục. `order_type` (imaging/lab/procedure/medication/follow_up/referral/consent), `status` (open→routed→in_progress→awaiting_review→closed | cancelled), `close_mode` (invariant/evidence/manual), `parent_order_id` (consent = con của procedure), `due_at`, `kb_rule_id`, `is_kb_mandatory`, `exception_reason`, `cancel_reason`. `ordered_by` = chữ ký bác sĩ = thẩm quyền.
- **`order_evidence`** — bằng chứng đóng y lệnh (file phim, scan consent, bản ghi, tick). Trigger tự đóng order khi bằng chứng thỏa.
- **`consents`** — chi tiết cam kết (scan_path, signer, signed_date, force_emergency/force_reason). Gate đóng bằng 4 điều kiện (xem dưới).
- **`kb_rules`** — quy tắc KB theo `procedure_type` → nháp y lệnh điền sẵn (rule engine, KHÔNG LLM).
- **`nka_systemic_flags`** — danh sách bệnh nền phi-nha đổi cách làm răng (chống đông, bisphosphonate, tiểu đường…) cho Lane1.
- **`dental_snomed_whitelist`** — ~134 mã SNOMED nha (trích từ 6 module) lọc Lane2.
- **`emr_*`** (9 bảng) — EMR tham chiếu (Synthea Việt-hóa), read-only, cho Customer Graph.
- **`visit_sessions`** — ca khám (queue số 0-999 / bed_number cấp cứu). Giữ từ model trước; các cột rounds/checklist đã ngừng dùng.
- **`alerts`** — cảnh báo (repoint `order_id`).
- **Views:** `order_violations` (vi phạm treo), `pending_review_orders` ("chờ tôi xem").

```mermaid
erDiagram
  visit_sessions ||--o{ medical_orders : has
  patients ||--o{ medical_orders : for
  medical_orders ||--o| medical_orders : "parent (consent gate)"
  medical_orders ||--o{ order_evidence : closed_by
  medical_orders ||--o| consents : gate_detail
  kb_rules ||--o{ medical_orders : drafts
  patients ||--o{ emr_encounters : history
```

## Vòng đời y lệnh + 3 hạng đóng
Ban (OPEN, ký) → route đúng vai → thực thi → **bằng chứng về → tự đóng** → hàng đợi "chờ tôi xem".

- ① **Bất biến giao diện** — dị ứng/tiệt trùng luôn hiện, không tick.
- ② **Tự đóng bằng bằng chứng** — phim→file, consent→scan, recall→lịch. KHÔNG ai tick.
- ③ **Tick tay** — tối thiểu (procedure).

**Vi phạm = query deterministic** (`order_violations`), KHÔNG điểm: y lệnh còn mở khi quá hạn HOẶC khi ca đã `done` (buộc treo vào vòng đời ca, không chỉ due_at); procedure đóng khi consent gate mở (trừ force).

```mermaid
flowchart LR
  A[Ban y lệnh OPEN] --> B[route đúng vai]
  B --> C[thực thi + nạp bằng chứng]
  C --> D{close_mode}
  D -- evidence --> E[tự đóng → awaiting_review]
  D -- manual --> F[tick → awaiting_review]
  E --> G[Bác sĩ đóng final]
  F --> G
  B -.quá hạn/ca done còn mở.-> V[order_violations → alert]
```

## Consent gate (§4.D)
Consent = y lệnh con (`parent_order_id`) của procedure. KB sinh khi `requires_consent`. Đóng khi ĐỦ 4 (engine `consent_gate_ok`, lễ tân chỉ nhập liệu): scan đính + `procedure_type` khớp nhóm (auto từ parent) + `opened_at ≤ signed_date ≤ hôm nay` (chống ký lùi + ngày tương lai) + người ký hợp lệ (tuổi<18 → guardian). Gate mở → procedure KHÔNG đóng được (trừ force cấp cứu + lý do có audit).

## Customer Graph — 3 lane (retrieval, KHÔNG inference)
- **Lane1 — panel an toàn** (`get_safety_panel`): dị ứng + thuốc đang dùng + cờ bệnh nền. **Toàn thân, hard-query, KHÔNG LLM.** Warfarin ghi ở khám tim mạch vẫn hiện vì gây chảy máu khi nhổ răng. Bất biến giao diện.
- **Lane2 — briefing** (Edge Function `briefing`): tóm tắt bệnh sử NHA (lọc whitelist) bằng LLM, **retrieval-only**, mỗi câu có `encounter_ids` + `verbatim_span`; câu thiếu nguồn / không trích nguyên văn / mang tính suy luận bị loại tại function.
- **Lane3 — CRM/recall** (`get_crm_recall`): khám nha gần nhất, follow_up treo, thủ thuật nha.

Ranh giới: Graph chỉ ĐỌC (panel trái workspace), KB GHI VÀO (nháp phải). Chỉ bác sĩ nối bối cảnh với y lệnh — hệ thống không tự ghi, không phán "nên làm gì".

## Route map theo vai
| Route | Vai | Nội dung |
|---|---|---|
| `/visits/$id` | Bác sĩ | Workspace: SafetyPanel + BriefingPanel (trái) · OrderDraftPanel + ActiveOrders + PendingReview (phải) |
| `/queue` | Trợ thủ | Call board + OrderExecutionList (upload bằng chứng) |
| `/checkin` | Lễ tân | CheckinForm + QueueBoard + ConsentQueue |
| `/follow-ups` | Lễ tân | RecallQueue (follow_up orders) |
| `/dashboard` | Quản lý | ViolationList + AlertsFeed + OpenCasesBoard (đếm treo, KHÔNG điểm) |
| `/my-checklist/$id` | Bệnh nhân (anon) | Checklist xét nghiệm/phim của 1 ca (RPC `get_patient_checklist`, chỉ cột whitelist) |

## Realtime & RLS
- Bảng live (`medical_orders`, `order_evidence`, `alerts`, `visit_sessions`) trong publication `supabase_realtime` + `REPLICA IDENTITY FULL`.
- RLS `is_staff()` blanket cho bảng lâm sàng; `emr_*` staff SELECT-only (PII, KHÔNG anon); storage buckets `order-evidence`/`consent-scans` private, RLS staff.
- Trigger fns SECURITY DEFINER + `search_path`; REVOKE EXECUTE khỏi client.

## Legacy (đã ngừng dùng)
Model cũ rounds/lab/checklist/follow_ups/compliance_score chạy song song tới khi UI chuyển xong, rồi drop qua `20260718090000_drop_legacy_model_OPTIONAL.sql` (optional, apply sau demo + backup). `types.ts` cần regenerate sau khi drop (hiện UI cast `ordersDb` cho bảng mới vì types.ts chưa regen).
