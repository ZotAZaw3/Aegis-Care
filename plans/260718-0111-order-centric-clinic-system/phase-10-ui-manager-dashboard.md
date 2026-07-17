# Phase 10 — UI Quản lý: dashboard danh sách vi phạm treo [post-24h]

> **Skill:** invoke `/ui-ux-pro-max` cho dashboard layout. KHÔNG dùng ring/gauge score.

## Context Links
- Brainstorm §9.1 (BỎ compliance_score — chỉ danh sách vi phạm treo per-case), §4.C nhánh lỗi.
- Deps: view `order_violations` + `refresh_alerts` (Phase 05).
- Route: `src/routes/_authenticated/dashboard.tsx` (bỏ compliance KPI/ring).

## Overview
- **Priority:** P1 — [post-24h]. Demo tối thiểu (§11) không bắt buộc dashboard này; engine đã sinh alert. Làm khi 24h-core xong.
- **Status:** pending.
- **Mô tả:** Dashboard giám sát cho quản lý = **danh sách vi phạm treo cụ thể** (per-case), KHÔNG con số điểm, KHÔNG phần trăm, KHÔNG ring.

## Key Insights
- **TUYỆT ĐỐI KHÔNG compliance_score** (§9.1): chấm người → checkbox theater (Goodhart). Đo bằng danh sách vi phạm treo — đếm được, khó gian, defensible. Việc TỪ CHỐI chấm người = dấu hiệu hiểu nghề.
- Vi phạm = deterministic query (`order_violations`): y lệnh quá hạn OPEN, procedure đóng khi consent gate mở.
- Trạng thái CA = "xong / còn N treo", KHÔNG phải điểm.
- (Dự phòng, KHÔNG làm cho bản này) tỷ lệ evidence-vs-tick nếu cần "con số" — chỉ giữ trong đầu, không hiển thị.

## Requirements
- FR1: danh sách vi phạm treo từ `order_violations` — mỗi dòng: BN, ca (session_number), loại y lệnh, kind vi phạm (overdue_open / procedure_closed_consent_open), quá hạn bao lâu, vai phụ trách.
- FR2: filter theo vai / loại vi phạm / khoảng thời gian; link tới ca.
- FR3: feed alerts (từ Phase 05) + nút refresh (`refresh_alerts`).
- FR4: trạng thái ca đang mở: mỗi ca "còn N y lệnh treo" (đếm), KHÔNG điểm.
- NFR: i18n; file <200 dòng; KHÔNG import compliance-ring.

## Architecture
```
/dashboard (manager/admin)
 ├─ <ViolationList>      (order_violations, filter, link ca)
 ├─ <AlertsFeed>         (alerts + refresh)
 └─ <OpenCasesBoard>     (visit đang mở + count order treo)   -- đếm, không score
```

## Related Code Files
**Create:**
- `src/components/manager/violation-list.tsx`
- `src/components/manager/open-cases-board.tsx`

**Modify:**
- `src/routes/_authenticated/dashboard.tsx` — bỏ compliance KPI/ring; lắp components mới.
- `src/components/alerts-bell.tsx` — repoint sang alerts.order_id nếu cần.
- `src/lib/i18n.tsx` — keys (violation, overdue_open, consent_gate_open, hanging_orders...).
- **Delete:** `src/components/compliance-ring.tsx` (không còn dùng — xác nhận không import nơi khác).

**Read for context:** `order_violations` view (Phase 05), dashboard.tsx hiện tại.

## Implementation Steps
1. `violation-list.tsx`: query `order_violations` (join patient/session cho hiển thị); cột + filter; link `/visits/$id`.
2. `open-cases-board.tsx`: visit đang mở + subquery đếm order treo mỗi ca; hiển thị "còn N treo" (KHÔNG %).
3. Sửa `dashboard.tsx`: xóa mọi KPI score/ring; lắp ViolationList + AlertsFeed + OpenCasesBoard.
4. Xóa `compliance-ring.tsx` + dọn import.
5. i18n keys. Build sạch. Grep `compliance_score`/`ComplianceRing` = 0 kết quả.

## Todo List
- [ ] `violation-list.tsx` (order_violations + filter + link)
- [ ] `open-cases-board.tsx` (đếm order treo, không score)
- [ ] Sửa `dashboard.tsx` bỏ ring/KPI score
- [ ] Xóa `compliance-ring.tsx` + dọn import
- [ ] i18n keys + build sạch; grep score = 0

## Success Criteria
- Dashboard hiện danh sách vi phạm treo cụ thể (per-case), có cả consent-gate-open.
- KHÔNG con số điểm/phần trăm/ring ở bất kỳ đâu.
- `grep -r compliance_score src/` và `ComplianceRing` → 0.
- Link vi phạm → mở đúng ca.

## Risk Assessment
- **Cám dỗ thêm "con số cho đẹp"** → KHÔNG. Giữ nguyên tắc §9.1; nếu giám khảo hỏi "đo cải thiện": đếm vi phạm treo (dự phòng evidence-vs-tick, không hiển thị).

## Security Considerations
- Route manager/admin (UI gate). Dữ liệu vi phạm chứa BN → is_staff blanket.

## Next Steps
- Phase 11 dọn docs + verify build toàn hệ thống.
