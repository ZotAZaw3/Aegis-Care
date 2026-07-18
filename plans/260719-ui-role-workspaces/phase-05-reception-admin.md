# Phase 05 — Reception polish (tablet) + Admin nav + tách Ops + Labs tab

## Context
- `src/routes/_authenticated/reception.tsx` + `src/components/reception/{reception-board,recall-queue,consent-queue,checkin-form,consent-form}.tsx`. `src/routes/_authenticated/dashboard.tsx` (đang nhồi Ops + open-cases + copilot-home). `src/components/manager/ops-*`. `src/routes/_authenticated/patients.$id.tsx` (+ get_observation_history cho Labs tab).

## Overview
- **Priority:** trung bình. Phụ thuộc P01 (+P02 để gỡ open-cases khỏi dashboard).
- Dọn dashboard thành **admin-only Ops**; reception tablet-friendly; admin nav quản trị; thêm **Labs tab** ở hồ sơ BN.

## Key Insights
- `/dashboard` hiện: admin thấy Ops+cases, non-admin thấy cases+copilot. Sau khi có /clinic (P02) + workspace vai, **dashboard chỉ còn Ops cho admin**; non-admin không vào /dashboard (redirect resolveHome). Gỡ trùng open-cases.
- Reception-board đã có; chỉ polish tablet (touch ≥44px, spacing) + PageHeader + tách tab recall/consent nếu chật.
- Labs tab hồ sơ BN: dùng `get_observation_history` (P02 observations) — lịch sử theo thời gian (bổ sung SafetyPanel latest).

## Requirements
**Functional**
- `/dashboard`: chỉ render Ops (kpi/trend/workload/report) cho admin; bỏ open-cases + copilot-home khỏi đây (đã có /clinic + floating copilot). Non-admin vào → redirect resolveHome.
- `/reception`: PageHeader + reception-board (tablet responsive). Recall/Consent giữ (tab hoặc section). Gate receptionist/assistant/admin.
- Admin nav: mục **Quản trị** `/admin` (staff/role — đã có admin.tsx) + CRM (đã có). Đảm bảo nav admin đầy đủ.
- Hồ sơ BN `/patients/$id`: thêm **tab "Xét nghiệm"** dùng get_observation_history (list theo thời gian, filter theo mã). Bổ sung SafetyPanel observations (latest).

**Non-functional**
- Tablet: touch ≥44px, không horizontal-scroll. i18n vi+en. <200 dòng/file (tách tab component).

## Related Code Files
**Modify:** `src/routes/_authenticated/{dashboard,reception,patients.$id}.tsx`, i18n. **Create:** `src/components/patient/labs-history-tab.tsx` (nếu tách).

## Implementation Steps
1. Dashboard → admin-only Ops; non-admin redirect.
2. Reception polish tablet + PageHeader.
3. Admin nav đầy đủ (Quản trị/CRM).
4. Labs tab hồ sơ BN (get_observation_history). i18n. `tsc` + build.

## Todo List
- [ ] Dashboard admin-only Ops + non-admin redirect
- [ ] Reception tablet polish + PageHeader
- [ ] Admin nav (Quản trị/CRM)
- [ ] Labs tab hồ sơ BN
- [ ] i18n + build

## Success Criteria
- Admin `/dashboard` chỉ Ops; non-admin không vào (redirect).
- Reception dùng tốt trên tablet.
- Hồ sơ BN có tab Xét nghiệm hiện lịch sử observations.

## Risks
- **Gỡ open-cases khỏi dashboard** phải sau /clinic (P02) để dentist không mất đường vào. Thứ tự đúng.

## Security
- Gate admin cho Ops (UI + get_ops_metrics guard). RLS labs staff.

## Next
- P06 visual/perf/a11y toàn app.
