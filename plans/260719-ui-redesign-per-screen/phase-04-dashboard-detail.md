# Phase 04 — Dashboard Ops + Patient detail redesign

## Context
- `src/routes/_authenticated/dashboard.tsx` (admin Ops: kpi/trend/workload/report), `src/routes/_authenticated/patients.$id.tsx` (hồ sơ BN: safety/dental/labs/visits/allergies), component manager/ops-*, patient/*.
- **Design nguồn: `design-system/aegis-care/pages/dashboard.md`** (override MASTER) — bám file này cho layout Ops.

## Overview
- **Priority:** trung bình. Phụ thuộc P01. Bố cục Data-Dense cho 2 màn nhiều thông tin nhất.

## Requirements
**Functional**
- **Dashboard Ops**: bố cục grid Data-Dense — hàng KPI đầy đủ (BN/quá hạn/vi phạm/finding) mật độ cao; chart + workload cạnh nhau; report panel gọn. Bỏ khoảng trống thừa, max-width rộng hơn (dashboard là data-heavy).
- **Patient detail**: chuyển sang **tabs** (Tổng quan / An toàn+Labs / Bệnh sử / Dị ứng) thay vì cuộn dài 1 cột; header BN gọn (avatar initials + info + actions); SafetyPanel + LabsHistory nhóm hợp lý; visit history dạng list gọn.

**Non-functional**
- Reuse component; đổi bố cục/tabs. i18n. Responsive (tabs → accordion/stack ở hẹp). <200 dòng (tách tab content).

## Related Code Files
**Modify:** `src/routes/_authenticated/{dashboard,patients.$id}.tsx`. **Reuse:** ui/tabs.tsx, ops-*, safety-panel, labs-history, dental-record.

## Todo List
- [ ] Dashboard Ops grid Data-Dense (KPI/chart/workload/report)
- [ ] Patient detail tabs + header gọn
- [ ] i18n + responsive + screenshot verify

## Success Criteria (playwright)
- Dashboard mật độ cao, không trống thừa. Patient detail có tabs, không cuộn dài lê thê.

## Risks
- **recharts trong tab** — render khi tab active (lazy/mount) tránh layout lỗi.

## Next
- P05 polish toàn app.
