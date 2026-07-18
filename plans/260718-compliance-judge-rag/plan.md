---
title: Compliance Judge (RAG + deterministic) + auto-append graph
status: in_progress  # code+unit+build PASS; chờ user áp 2 migration + chạy 3 kịch bản DB/UI
created: 2026-07-18
scope: ~24h (bỏ imaging)
builds_on: [260718-0111-order-centric-clinic-system, 260718-1456-agent-backend-rag-live-graph]
blockedBy: []
blocks: []
---

# Compliance Judge — Overview

Lấp gap #1 của Executive Summary: bước AI **đối chiếu y lệnh ↔ hồ sơ ↔ KB tại điểm ký**, cảnh báo bước thiếu / rủi ro / chưa tuân thủ kèm căn cứ; người quyết. Thiết kế chốt ở `brainstorm-report.md` (authoritative).

**Nguyên tắc bất biến:** agent tư vấn — engine thi hành — người quyết · **zero false assertion** (không nói sai; chấp nhận sót) · KHÔNG compliance_score · deterministic-first.

## Kiến trúc 2 lớp (tại `OrderDraftPanel.sign()`, trước `insertSignedOrders`)
- **Lớp A tất định** — SQL từ `kb_rules` + `get_safety_panel`. Có thẩm quyền: `missing_mandatory`, `consent_missing`, `safety_flag` (chỉ nêu fact). → chặn mềm (ack + lý do).
- **Lớp B RAG** — `kb_search` → gpt-4o-mini temp 0, mỗi advisory bắt buộc citation. **Hậu-kiểm citation server-side**: drop advisory nào trích dẫn không map vào chunk thật của lượt này (răng cưa chống-sai).
- **Output:** `hard_findings[]` · `advisories[]` · `insufficient[]` · `verdict: clean|has_findings`. KHÔNG điểm.

Tái dùng nguyên stack copilot (`/api/copilot` pattern: JWT→RLS, `env.ts`, OpenAI, RPC). KHÔNG Edge Function mới.

## Phases
| # | Phase | Trạng thái | File |
|---|---|---|---|
| 01 | Migration: trigger append condition + bảng audit | ✅ code (chờ áp SQL) | [phase-01](phase-01-migration-schema.md) |
| 02 | Lớp A tất định (server helper) | ✅ done | [phase-02](phase-02-deterministic-layer.md) |
| 03 | Route `/api/compliance-judge` + RAG + hậu-kiểm citation | ✅ done | [phase-03](phase-03-judge-route.md) |
| 04 | UI modal tại điểm ký (ack + lý do) | ✅ done | [phase-04](phase-04-ui-modal.md) |
| 05 | Test 4 kịch bản + verify | 🟡 unit PASS; DB/UI chờ user | [phase-05](phase-05-testing.md) |

## Dependencies (đã áp, không block)
- `kb_rules` + `get_order_drafts` (mig 040000), `get_safety_panel` (060000), `kb_search` + `kb_chunks` (120000), copilot stack (`src/server/copilot/`), live-graph triggers (110000).
- Ràng buộc: file <200 dòng · i18n vi+en · migration áp tay qua Supabase SQL Editor (immutable) · types.ts cũ → dùng `ordersDb`/`db as any`.

## Định nghĩa "không sai" (nói rõ khi demo)
Zero false assertion — không bao giờ khẳng định sai/vô căn cứ. KHÔNG bảo đảm 100% recall (thà sót còn hơn nói bậy).
