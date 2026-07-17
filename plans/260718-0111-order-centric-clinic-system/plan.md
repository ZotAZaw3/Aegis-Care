---
status: pending
blockedBy: []
blocks: []
redTeam: reports/red-team-260718.md
---

# Kế hoạch: Hệ thống vận hành phòng khám nha lấy Y LỆNH làm trục

Nguồn chốt: `plans/20260717-brainstorm-clinic-order-compliance-system/brainstorm-report.md` (authoritative — không mở lại).
Nguyên tắc: Human-first, agent-support · Retrieval KHÔNG inference · Deterministic-first · KHÔNG compliance_score ở bất kỳ đâu.

Stack giữ nguyên: TanStack Start + React 19 + TanStack Router/Query + Tailwind 4 + shadcn/ui + Supabase. **Migration ADDITIVE (không đập sạch ngay — xem dưới).**

> **⚠ RED-TEAM (2026-07-18):** đã review đối kháng, tìm 3 cụm lỗi (engine deterministic không vững, 2 lỗ bảo mật chí tử, phạm vi 24h gấp rưỡi khả thi). **Fixes BẮT BUỘC áp dụng trước khi cook** — chi tiết `reports/red-team-260718.md`; mỗi phase bị ảnh hưởng có khối "RED-TEAM FIXES" ở đầu file. Nhãn 24h dưới đã reshape theo kết luận red-team.

## Chiến lược migration (SỬA theo red-team C2)
KHÔNG drop bảng cũ ở Phase 01 — thêm bảng order-centric **bên cạnh** schema cũ; stub 2 route mồ côi (`my-checklist`, `crm`) để branch xanh liên tục (Lovable sync). **DROP model cũ dồn về Phase 11** sau khi UI mới thay hết. Giữ branch build được suốt quá trình.

## Danh sách Phase (nhãn reshaped)

| # | Phase | Nhãn 24h | Phụ thuộc |
|---|---|---|---|
| 01 | [Schema order-centric (ADDITIVE)](phase-01-schema-reset-order-centric.md) | **24h-core** | — |
| 02 | [Synthea EMR seed](phase-02-synthea-emr-seed.md) | **post-24h** — 24h dùng **seed tay 2-3 BN** | 01 |
| 03 | [Customer Graph read layer](phase-03-customer-graph-read-layer.md) | **24h-core** (gọn ~30 mã) | 01, 02/seed-tay |
| 04 | [Briefing LLM](phase-04-edge-function-briefing.md) | **24h-core** (+plan B server route) | 01, seed, 03 |
| 05 | [Order lifecycle engine](phase-05-order-lifecycle-engine.md) | **24h-core** | 01 |
| 06 | [KB draft engine](phase-06-kb-draft-engine.md) | **24h-core** (đường cắt cuối) | 01, 05 |
| 07 | [UI Bác sĩ workspace](phase-07-ui-dentist-workspace.md) | **24h-core** (trái tim demo) | 03,04,05,06 |
| 08 | [UI Trợ thủ](phase-08-ui-assistant-execution.md) | **post-24h** — 24h chỉ list read-only | 05 |
| 09 | [UI Lễ tân](phase-09-ui-reception-checkin-consent.md) | **24h: chỉ ConsentForm**; check-in/recall post-24h | 01, 05 |
| 10 | [UI Quản lý dashboard](phase-10-ui-manager-dashboard.md) | **post-24h** | 05 |
| 11 | [Docs + i18n + DROP cũ + verify](phase-11-docs-i18n-verify.md) | **24h-core** (gọn: vi-only, DROP model cũ) | tất cả |

## Đường 24h thực tế (khớp brainstorm §11, red-team C1/C3)
`01(additive) → seed tay 2-3 BN → 03(gọn) → 04(+plan B) → 05 → 06 → 07 → ConsentForm của 09`.
Hoãn post-24h: 02-full ETL, 08, 10, phần lớn 11. ~6.5 phase giữ, không phải 10/11.

## Ranh giới AI (không đổi)
- LLM chỉ ở Phase 04 (briefing): retrieval-only, mỗi câu cite encounter id + **verbatim substring**, KHÔNG kết luận lâm sàng. Citation-check = chống bịa nguồn, KHÔNG phải chống suy diễn (red-team B3).
- Dị ứng/thuốc/bệnh nền (Lane1) = query cứng, **enumerate hoạt chất + match RxNorm** (red-team B2), KHÔNG qua LLM (Phase 03).
- Phát hiện vi phạm = query (Phase 05), deterministic — **buộc vào vòng đời ca, không chỉ due_at** (red-team A1).
- KB (Phase 06) = rule engine định hình nháp, KHÔNG bắn cảnh báo chủ động.

## Nhắc skill cho phase UI
Phase 07–10: invoke `/ui-ux-pro-max`. Diagram docs (Phase 11): `/mermaidjs-v11`.
