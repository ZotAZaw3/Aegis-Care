# Hướng dẫn sử dụng — Aegis Care (hệ thống vận hành phòng khám nha lấy Y LỆNH làm trục)

Hệ thống giúp phòng khám nha khoa **không bỏ sót bước / không thiếu hồ sơ / không quên theo dõi / không phối hợp kém** bằng cách lấy **y lệnh (medical order)** làm trục: bác sĩ ban y lệnh → hệ thống định tuyến đúng vai → thực thi + nạp bằng chứng → tự đóng. Y lệnh nào "treo" (không đóng) = vi phạm, phát hiện bằng truy vấn tất định (không chấm điểm ai).

> Kiến trúc kỹ thuật đầy đủ: xem `ARCHITECTURE.md`.

---

## 1. Yêu cầu

- **Node.js** (đã có npm). Dự án dùng React 19 + TanStack Start + Vite + Supabase.
- **Supabase project** (đã kết nối — `rwvfpjtxcmubjqelsncq`) với các **migration đã apply** (xem §3).
- **Edge Function `briefing`** đã deploy + đặt secret `OPENAI_API_KEY` (nếu muốn dùng tính năng tóm tắt bệnh sử bằng AI).
- File **`.env`** có `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (đã có sẵn).

---

## 2. Cài & chạy local

```bash
npm install      # lần đầu
npm run dev      # chạy dev server (Vite)
```

Mở URL Vite in ra ở terminal (thường `http://localhost:5173` hoặc cổng Lovable cấu hình). Build production: `npm run build`.

---

## 3. Chuẩn bị dữ liệu (một lần, trong Supabase SQL Editor)

Dán nội dung từng file `supabase/migrations/*.sql` vào **SQL Editor → Run**, theo thứ tự tên file. Các file lõi (`202607180200*`–`030000`) và data (`050000`, `06*`) cần chạy hết. Kiểm nhanh đã đủ:

```sql
select count(*) from public.medical_orders;         -- bảng trục tồn tại
select count(*) from public.kb_rules;                -- 10 (nếu 040000 đã chạy)
select count(*) from public.patients;                -- >= 3 (bệnh nhân demo)
select public.get_safety_panel('28db9679-adcd-baef-63fb-68024ced5adf');  -- panel an toàn
```

> ⚠ **KHÔNG** chạy `20260718090000_drop_legacy_model_OPTIONAL.sql` cho tới khi demo xong + đã backup.

### Tạo tài khoản nhân viên + gán vai
1. Vào trang `/auth` → **Đăng ký** một tài khoản (email + mật khẩu).
2. Cần có bản ghi `staff` + vai trong `user_roles`. Nếu trang `/admin` chưa gán được, chạy SQL (thay `<user_id>` = id trong `auth.users`):
```sql
insert into public.staff (user_id, full_name) values ('<user_id>', 'BS. Demo') returning id;
insert into public.user_roles (user_id, role) values ('<user_id>', 'dentist');
-- gán thêm vai để test đủ 4 màn:
insert into public.user_roles (user_id, role) values ('<user_id>', 'receptionist'), ('<user_id>', 'assistant'), ('<user_id>', 'admin');
```

### Tạo 1 ca khám demo (để mở workspace bác sĩ)
Bệnh nhân demo chưa có ca khám — tạo một cái cho bệnh nhân **Warfarin** (kịch bản Lane1 mạnh nhất):
```sql
insert into public.visit_sessions (patient_id, session_number, status)
values ('28db9679-adcd-baef-63fb-68024ced5adf', 1, 'in_exam')
returning id;   -- mở /visits/<id trả về>
```

---

## 4. Luồng sử dụng theo 4 vai

Đăng nhập rồi dùng thanh điều hướng bên trái. Một ca đi qua: **Lễ tân → Bác sĩ → Trợ thủ → Lễ tân (consent) → Bác sĩ (đóng) → Lễ tân (recall)**. Quản lý giám sát ở dashboard.

### 4.1. Lễ tân — `/checkin`
- **Check-in:** tìm/tạo bệnh nhân → tạo ca. Thường → hệ tự cấp **số 0-999**; cấp cứu → nhập **số giường (bed)**.
- **Hàng đợi:** danh sách ca `chờ / đã gọi`.
- **Cam kết (Consent):** danh sách gate cam kết đang mở (do bác sĩ ban). Mở form → chọn **người ký** (bệnh nhân/giám hộ) + **ngày ký** + **tải scan giấy ký** → gửi. Nếu đủ điều kiện, gate **tự đóng**; nếu chưa, hệ hiện **lý do** (vd "ngày ký trước ngày ban y lệnh", "bệnh nhân vị thành niên — cần giám hộ").

### 4.2. Bác sĩ — `/visits/$id` (workspace 2 cột)
**Cột trái — bối cảnh (chỉ đọc):**
- **AN TOÀN (Lane1):** dị ứng (đỏ nếu nặng) + thuốc đang dùng + **cờ bệnh nền** (vd "Chống đông: warfarin"). Đây là **truy vấn cứng, KHÔNG qua AI** — luôn hiện, không ẩn. Bệnh nhân Warfarin sẽ hiện 4 cờ chảy máu.
- **BỆNH SỬ (Lane2, AI):** bấm để AI tóm tắt bệnh sử nha, **mỗi câu có trích dẫn** encounter nguồn. AI chỉ kể lại dữ kiện đã ghi, không chẩn đoán/khuyến nghị.

**Cột phải — ghi:**
- **Nháp y lệnh:** chọn **loại thủ thuật** (vd "Cấy ghép") → KB tự điền các bước (CBCT, kháng sinh, cấy trụ…). Bỏ tick bước nào để loại; bỏ **bước bắt buộc** → phải **nhập lý do** (lưu vết audit). Bấm **"Ký & ban"** → tạo y lệnh (kèm **gate cam kết** nếu thủ thuật cần).
- **Y lệnh của ca:** trạng thái từng y lệnh; procedure chưa có cam kết hiện "Chờ cam kết".
- **Chờ tôi xem:** kết quả y lệnh đã thực thi xong, chờ bác sĩ đóng final.

### 4.3. Trợ thủ — `/queue`
- **Gọi số:** bảng gọi bệnh nhân theo hàng đợi.
- **Thực thi y lệnh:** danh sách y lệnh route tới trợ thủ (chụp phim, xét nghiệm). Với y lệnh "đóng bằng bằng chứng" → **tải file phim/kết quả** (KHÔNG tick tay). Nạp xong, engine **tự đóng** y lệnh → nó biến khỏi hàng đợi và về "chờ tôi xem" của bác sĩ.
- Y lệnh **quá hạn** hiện đỏ.

### 4.4. Quản lý — `/dashboard`
- **Danh sách vi phạm treo:** từng y lệnh treo cụ thể (quá hạn / ca đã đóng mà còn treo / thủ thuật đóng khi chưa cam kết) + vai phụ trách + link tới ca. **KHÔNG có điểm/phần trăm** — có chủ đích (chấm điểm người sinh gian lận).
- **Cảnh báo:** feed alert + nút "Làm mới".
- **Ca đang mở:** mỗi ca hiển thị "còn N y lệnh treo" (đếm, không điểm).

### 4.5. Bệnh nhân — `/my-checklist/<id>` (công khai, không đăng nhập)
Trang mobile hiển thị checklist xét nghiệm/chụp phim của ca (chỉ cột tối thiểu). Link/QR do nhân viên đưa.

---

## 5. Khái niệm chính

- **3 hạng đóng y lệnh:** ① bất biến giao diện (dị ứng — luôn hiện) · ② tự đóng bằng bằng chứng (phim, scan) · ③ tick tay (tối thiểu).
- **Cam kết = gate:** thủ thuật không đóng được khi cam kết chưa hợp lệ (4 điều kiện). Cấp cứu mới được force + ghi lý do.
- **Vi phạm = truy vấn:** y lệnh mở mà không đóng (quá hạn hoặc khi ca đã đóng) → tất định, đếm được. Đây là "compliance miễn phí".
- **Ranh giới AI:** AI chỉ **tóm tắt có trích dẫn** (Lane2). Dị ứng/thuốc (Lane1) và phát hiện vi phạm là **truy vấn cứng**, không để AI chịu trách nhiệm nhớ.

---

## 6. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Panel an toàn rỗng | Chưa apply seed (`050000`) hoặc bệnh nhân không có dữ liệu. |
| Nháp y lệnh trống | Chưa apply `040000_kb_rules`. |
| Briefing lỗi/"chưa sẵn sàng" | Chưa deploy function `briefing` hoặc thiếu `OPENAI_API_KEY`. Không chặn phần còn lại. |
| Gate cam kết không đóng | Xem lý do hiện trên form (ngày ký / người ký). Điều kiện thật do engine kiểm. |
| Label hiện dạng key thô (vd `sign_orders`) | Thiếu key i18n — báo để bổ sung. |
| Đăng nhập được nhưng không thấy dữ liệu | Tài khoản chưa có vai staff (`user_roles`) → RLS chặn. Gán vai (xem §3). |
| `Missing Supabase environment variable` | Thiếu `.env` (URL + publishable key). |

---

## 7. Ghi chú

- `types.ts` chưa regenerate cho bảng mới → UI dùng client ép kiểu (`ordersDb`). Muốn type thật: regenerate qua Supabase dashboard.
- Repo nối Lovable: commit lên `main` sẽ sync editor Lovable.
- Sau demo, có thể dọn model cũ bằng `20260718090000_drop_legacy_model_OPTIONAL.sql` (nhớ backup).
