# Brainstorm — AI Ops Report & Analytics (lớp quản trị)

**Ngày:** 2026-07-18 · **Trạng thái:** ĐÃ CHỐT (đã reframe v2), chờ plan. Lấp gap #7 Executive Summary.

## 1. Sự thật cốt lõi
= **80% dashboard tất định + 20% AI**. Phần lớn (số BN, thông lượng order, đếm vi phạm, khối lượng theo vai) là **tổng hợp SQL thuần** — KHÔNG để LLM tính số (LLM tính = hallucinate). Phần "AI" = **báo cáo vận hành**: tóm tắt + **vấn đề nổi bật** + **phân tích Mức 1 (bám số)**. Đúng ranh giới: deterministic-first, retrieval-not-inference, KHÔNG compliance_score (đếm + Δ thay %).

## 1b. Reframe v2 (user chốt) — KHÔNG số hóa giao ban
Quy trình thật: 7h **giao ban offline bắt buộc** — hệ thống KHÔNG thay/không số hóa buổi họp. AI chỉ **tạo báo cáo/phân tích on-demand** để lãnh đạo đọc trước/tại buổi đó rồi tự quyết.
- Bỏ khung "meeting" thực thể số: `meeting_summaries`→**`ops_reports`**, `/api/meeting-summary`→**`/api/ops-report`**.
- **Phân tích Mức 1 (bám số)**: xếp hạng/so sánh/xu hướng + khoan vào thực thể sau con số (nuôi bằng `highlights` tất định từ RPC). **CẤM Mức 2 (giải thích nguyên nhân) + Mức 3 (khuyến nghị)** — lãnh đạo quyết, human-first.

## 2. Quyết định đã chốt (user)
- Phạm vi: **có lịch sử/xu hướng nhiều kỳ** (không chỉ MVP snapshot).
- "Khoa/phòng ban": DB KHÔNG có khái niệm này → **nhóm theo `assigned_role`** (lễ tân/trợ thủ/bác sĩ). Trung thực với dữ liệu.
- Tóm tắt giao ban: **lưu bảng `meeting_summaries`** (lịch sử + bằng chứng demo).
- pg_cron: **GIỮ** (snapshot stock hằng ngày).

## 3. Flow vs Stock (điểm kỹ thuật then chốt)
- **Flow** (số ca/ngày, order tạo&đóng/ngày, Judge-finding/ngày): tính THẲNG từ bảng nguồn có timestamp (`GROUP BY ngày`) — KHÔNG cần snapshot. DRY, chính xác.
- **Stock** ("vi phạm treo / finding chưa ack TẠI ngày quá khứ"): view sống không dựng lại được → **bảng `ops_metrics_daily` + pg_cron daily**. Fallback nếu cron không bật: snapshot khi tạo summary.
→ Tránh bẫy "snapshot mọi thứ".

## 4. Kiến trúc (3 tầng, tái dùng tối đa)
**Tầng 1 — Metrics tất định** (SECURITY INVOKER, admin-gated qua RLS `has_role('admin')` ở tầng UI/route):
- `get_ops_metrics(p_from,p_to)` → snapshot jsonb hiện tại: visits theo status/ngày; medical_orders theo status/order_type; số quá hạn (`due_at<now` & chưa closed); `order_violations` count; `compliance_judgments` có hard_findings + số chưa ack; khối lượng theo `assigned_role`; pending_review theo bác sĩ. Kèm Δ hôm nay/hôm qua.
- `get_ops_trends(p_from,p_to)` → chuỗi ngày (flow) từ nguồn cho chart.

**Tầng 2 — Lịch sử stock**: `ops_metrics_daily(day date pk, metrics jsonb, created_at)` + pg_cron job daily gọi hàm `snapshot_ops_metrics()` (ghi stock hôm nay). Fallback: gọi trong route summary.

**Tầng 3 — Báo cáo vận hành**: `/api/ops-report` (tái dùng stack copilot: JWT→RLS, env, OpenAI). Server tự gọi lại `get_ops_metrics` (không tin client, gồm `highlights`) → LLM gpt-4o-mini temp 0, prompt **Mức 1**: 3 mục (Tóm tắt / Vấn đề nổi bật từ highlights / Phân tích bám số — so sánh Δ, xu hướng); CẤM nguyên nhân + khuyến nghị → lưu `ops_reports(id, period_from, period_to, metrics jsonb, report text, created_by, created_at)`.

**UI** `/dashboard` (admin, mở rộng — hiện chỉ có OpenCasesBoard):
- Hàng thẻ KPI + mũi tên Δ (BN hôm nay, order quá hạn, vi phạm treo, finding chưa ack).
- Chart xu hướng bằng **recharts** (ĐÃ có trong deps — không thêm lib).
- Khối lượng theo vai (lễ tân/trợ thủ/bác sĩ).
- Nút "Tạo tóm tắt giao ban" + danh sách summary đã lưu.

## 5. Hướng loại bỏ
- (B) LLM tự truy vấn/tính số qua chat → sai số. Bỏ; LLM chỉ narrate.
- (C) BI đầy đủ (kho lịch sử riêng + drill-down) → over-engineer, YAGNI.

## 6. Rủi ro & giảm nhẹ
| Rủi ro | Giảm nhẹ |
|---|---|
| LLM sai số trong summary | Nguồn sự thật = thẻ card (tất định); summary temp 0 chỉ thuật; card là chỗ kiểm chứng |
| pg_cron không bật được trên project | Fallback snapshot-on-summary; hàm `snapshot_ops_metrics()` gọi được cả 2 đường |
| "tỷ lệ tuân thủ" mô tả nêu nhưng ta không chấm điểm | Trình bày = đếm + Δ (↑/↓); diễn đạt lại chữ "tỷ lệ" khi demo |
| Quyền: lộ số vận hành cho non-admin | RPC + route + route UI đều gate `has_role('admin')` |
| Trend rỗng nếu ít hoạt động | Seed sẵn 800 BN + hoạt động demo; flow từ nguồn vẫn hiện lịch sử order |

## 7. Tiêu chí thành công
- `/dashboard` (admin) hiện KPI thật khớp query tay + chart xu hướng ≥2 tuần.
- Non-admin KHÔNG thấy trang/route (RLS + gate).
- "Tạo tóm tắt giao ban" → text tiếng Việt chỉ chứa số có trong snapshot (kiểm tay không có số bịa), lưu `meeting_summaries`.
- pg_cron ghi `ops_metrics_daily` 1 dòng/ngày (hoặc fallback hoạt động).

## 8. Phase gợi ý (lớn hơn Judge — làm tuần tự)
P1 metrics RPC (get_ops_metrics + get_ops_trends) · P2 history (ops_metrics_daily + snapshot fn + pg_cron) · P3 route /api/meeting-summary + prompt + bảng meeting_summaries · P4 dashboard UI (KPI cards + recharts + workload theo vai + summary panel) · P5 test + verify.

→ `/ck:plan`.
