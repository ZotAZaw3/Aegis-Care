# Phase 05 — Test 4 kịch bản + verify

## Overview
- **Priority:** cao (chứng minh "không sai" + gác cổng hoạt động). Phụ thuộc: P01–P04.
- **Status:** pending.
- KHÔNG có test runner trong repo → verify = `tsc --noEmit` + `npm run build` sạch + kịch bản tay + 1 unit thuần cho citation-guard (chạy bằng `node`).

## Key Insights
- "Không sai" đo được rõ nhất ở **citation-guard**: unit test thuần (không cần framework) inject advisory có citation ma → phải bị drop. Đây là bằng chứng cưỡng chế zero-false-assertion.
- Các kịch bản còn lại kiểm trên UI thật (BN Synthea giàu nha + có cờ bệnh nền).

## Test Scenarios
1. **Thiếu mandatory buộc lý do:** chọn procedure có bước mandatory → bỏ tick 1 bước → Ký → dialog hiện `missing_mandatory`, nút Ký disabled tới khi nhập lý do → nhập → ký thành công. `compliance_judgments` có row, `ack_reasons` chứa lý do.
2. **Cờ chống đông + nhổ răng:** BN có systemic_flag chống đông (tìm qua `get_safety_panel`) + procedure extraction → dialog hiện `safety_flag` (fact) + ≥1 `advisory` trích dẫn SOP/quy định chống đông NẾU corpus có; nếu không → `insufficient` "cần đối chiếu thêm" (KHÔNG bịa).
3. **0 citation ma (unit):** `node` chạy `citation-guard` với advisories chứa `chunk_ref` không thuộc allowedCitations → tất cả bị drop/loại; advisory hợp lệ giữ lại. Assert đếm.
4. **Auto-append condition:** tạo/UPDATE 1 visit có `diagnosis` → 'done' → query `emr_conditions WHERE origin_visit_id=<visit>` = 1 (fire lại vẫn 1); mở hồ sơ BN → briefing/DentalRecord thấy chẩn đoán mới.

## Implementation Steps
1. `tsc --noEmit` + `npm run build` sạch.
2. Viết `scripts/test-citation-guard.mjs` (thuần node, import guard) — kịch bản 3.
3. Chạy tay kịch bản 1,2,4 trên local (`npm run dev`, đăng nhập staff) + xác nhận DB bằng service key script đọc.
4. Ghi kết quả vào `plans/260718-compliance-judge-rag/reports/test-report.md`.

## Todo List
- [ ] tsc + build sạch
- [ ] scripts/test-citation-guard.mjs (kịch bản 3) pass
- [ ] Kịch bản 1 (missing mandatory) pass
- [ ] Kịch bản 2 (safety_flag + advisory/insufficient) pass
- [ ] Kịch bản 4 (auto-append condition) pass
- [ ] test-report.md

## Success Criteria
- 4 kịch bản pass; đặc biệt #3 chứng minh 0 citation ma.
- Không kịch bản nào để Judge đưa khẳng định pháp lý thiếu trích dẫn.

## Risk Assessment
- **Corpus thiếu văn bản cho kịch bản 2** → chấp nhận kết quả `insufficient` (đúng thiết kế, không phải fail).
- **BN không có cờ phù hợp** → dùng service-key script tìm BN có systemic_flag trước khi test.

## Security
- Test không commit dữ liệu BN thật; script đọc-only bằng key trong `.dev.vars`, xóa sau.

## Next Steps
- Xong → cập nhật `plan.md` status + `/ck:journal`. Cân nhắc thêm audit dashboard (ngoài scope 24h).
