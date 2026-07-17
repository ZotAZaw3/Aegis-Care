# Phase 11 — Docs + i18n + verify build [24h-core]

> **Skill:** invoke `/mermaidjs-v11` cho diagram trong docs.

## Context Links
- Brainstorm toàn bộ (nguồn nội dung docs).
- `ARCHITECTURE.md` hiện tại (viết lại theo model order-centric).
- `src/lib/i18n.tsx` (kiểm đủ key vi/en).

## Overview
- **Priority:** P0 cuối — chốt branch chạy được, docs khớp thực tế.
- **Status:** pending.
- **Mô tả:** Cập nhật `ARCHITECTURE.md` sang model y-lệnh-làm-trục; kiểm i18n đủ cặp vi/en; verify build + typecheck toàn repo; grep dọn tàn dư (compliance_score, lab_orders, rounds, checklist).

## Key Insights
- Docs cũ mô tả model rounds/lab/checklist/compliance_score — đã đập, phải viết lại kẻo lệch thực tế (docs sai nguy hiểm hơn không docs).
- Mọi label UI phải có key vi/en (convention ARCHITECTURE §i18n) — thiếu 1 ngôn ngữ = bug hiển thị.
- Branch phải luôn chạy được (Lovable sync) — build sạch là điều kiện chốt.

## Requirements
- FR1: viết lại `ARCHITECTURE.md`: roles, data model (medical_orders trục, order_evidence, consents, kb_rules, emr_*, views), vòng đời y lệnh, 3-lane, ranh giới AI, route map mới theo vai.
- FR2: diagram Mermaid v11: (a) 3 lớp KB/Order/Graph; (b) vòng đời y lệnh + 3 hạng đóng; (c) consent gate.
- FR3: kiểm i18n — mọi key dùng trong components mới có ở cả `vi` và `en`.
- FR4: verify `npm run build` + `tsc --noEmit` sạch; grep tàn dư = 0.
- FR5: cập nhật `docs/` nếu tồn tại (development-roadmap/changelog) — có thư mục `docs/` (chứa puml cũ); thêm ghi chú model mới.
- NFR: sacrifice grammar for concision trong docs nội bộ.

## Architecture
```
ARCHITECTURE.md (rewrite)
 ├─ Stack (giữ)
 ├─ Roles (giữ 4 vai)
 ├─ Data model: medical_orders (trục) + order_evidence + consents + kb_rules
 │              + visit_sessions (rút gọn) + emr_* + nka_systemic_flags + whitelist + views
 ├─ Order lifecycle + 3 hạng đóng (Mermaid)
 ├─ Consent gate (Mermaid)
 ├─ Customer Graph 3-lane + ranh giới retrieval-vs-inference
 ├─ Briefing edge function (Lane2)
 └─ Route map theo vai (dentist/assistant/reception/manager)
```

## Related Code Files
**Modify:**
- `ARCHITECTURE.md` — viết lại toàn bộ theo model mới.
- `src/lib/i18n.tsx` — bổ sung key thiếu; xóa key chết (compliance/rounds/lab nếu không dùng).
- `docs/` — thêm/cập nhật ghi chú model order-centric (nếu có roadmap/changelog).

**Delete/dọn:** mọi import chết tới `compliance-ring`, `lab_orders`, `visit_exam_rounds`, `checklist_*` còn sót.

**Read for context:** tất cả phase 01-10 (nguồn nội dung), components mới (nguồn i18n keys), brainstorm (câu pitch/ranh giới).

## Implementation Steps
1. Grep toàn repo: `compliance_score`, `ComplianceRing`, `lab_orders`, `visit_exam_rounds`, `checklist_items`, `checklist_rules`, `follow_ups`(bảng cũ), `treatment_sessions`, `appointments`. Với mỗi hit trong `src/` → sửa/xóa. Migration cũ để nguyên (lịch sử).
2. Kiểm i18n: liệt kê mọi `t("...")` key trong components mới (Phase 07-10); đảm bảo có ở cả `vi` và `en` trong `i18n.tsx`. Bổ sung thiếu.
3. Viết lại `ARCHITECTURE.md` theo cấu trúc trên; 3 diagram Mermaid v11 (dùng `/mermaidjs-v11` cho cú pháp).
4. Cập nhật `docs/` (nếu có roadmap/changelog): ghi milestone "chuyển sang model order-centric".
5. `npm run build` + `tsc --noEmit` (hoặc lệnh typecheck của repo) → fix mọi lỗi.
6. Chạy app local, smoke test 4 vai: check-in→ban order→thực thi→consent→review→vi phạm.
7. Xác nhận grep tàn dư = 0; branch chạy được.

## Todo List
- [ ] Grep + dọn tàn dư trong `src/` (score/lab/rounds/checklist)
- [ ] Kiểm & bổ sung i18n vi/en cho components Phase 07-10
- [ ] Viết lại `ARCHITECTURE.md` + 3 Mermaid v11
- [ ] Cập nhật `docs/` (nếu có roadmap/changelog)
- [ ] `npm run build` + typecheck sạch
- [ ] Smoke test 4 vai đầu-cuối
- [ ] Xác nhận grep tàn dư = 0

## Success Criteria
- `npm run build` + typecheck: 0 lỗi.
- `grep -r compliance_score src/` = 0; không import chết.
- Mọi key i18n dùng trong UI mới có đủ vi + en.
- `ARCHITECTURE.md` mô tả đúng model order-centric, 3 diagram render được.
- Smoke test 4 vai chạy trọn 1 ca.

## Risk Assessment
- **Sót key i18n** → script/grep liệt kê `t("...")` đối chiếu dict; thiếu → hiện key thô (bắt được khi smoke test).
- **Mermaid v11 lỗi cú pháp** → dùng `/mermaidjs-v11` skill; preview trước khi commit.

## Security Considerations
- Không commit secret (ANTHROPIC_API_KEY, service role) — kiểm `.gitignore` + grep trước commit.
- Docs không chứa key/credential thật.

## Next Steps
- Chốt branch, sẵn sàng demo. (post-24h: chatbot KB, AI điều phối lịch — brainstorm §3 HOÃN.)
