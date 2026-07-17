# Brainstorm Report — Hệ thống vận hành phòng khám nha lấy Y LỆNH làm trục

**Ngày:** 2026-07-17
**Bối cảnh:** DentalTech JSC — cuộc thi, sản phẩm thật, deadline 24h, AI bắt buộc
**Dataset:** Synthea dental (11.545 hồ sơ, 17 bảng CSV, 3.34GB, SNOMED/RxNorm/LOINC)
**Trạng thái codebase:** TanStack Start + Supabase, đã có schema tuân thủ deterministic (checklist_rules, treatment_sessions, follow_ups, alerts) — sẽ code lại

---

## 1. Đề bài (4 lỗi lặp lại ở phòng khám)

1. **Hồ sơ thiếu** — consent chưa ký, thiếu treatment plan / progress note / đơn thuốc
2. **Bỏ bước lâm sàng** — quên kiểm tiền sử / dị ứng / sinh hiệu, bỏ tiệt trùng, bỏ chụp phim
3. **Không theo dõi hậu điều trị** — không recall, không theo dõi hồi phục, không hướng dẫn chăm sóc
4. **Phối hợp kém** — miscommunication lễ tân/trợ thủ/bác sĩ, mất bàn giao ca, mất referral, chậm khởi trị

Hệ quả: an toàn bệnh nhân, tranh chấp y khoa, phạt pháp lý, mất uy tín.

---

## 2. Nguyên tắc cốt lõi (chốt)

- **Human-first, agent-support.** Con người quyết. Hệ thống *quan sát và phơi bày*, không chen ngang, không quyết lâm sàng.
- **Retrieval, KHÔNG inference.** Agent được truy xuất dữ kiện đã ghi; KHÔNG được rút kết luận lâm sàng mới.
- **Deterministic-first.** Tuân thủ là bài toán đúng/sai → query, không đưa LLM vào đường an toàn bệnh nhân.

---

## 3. Các hướng đã cân nhắc & quyết định

| Thành phần | Quyết định | Lý do |
|---|---|---|
| **Y lệnh làm vật thể trục** | GIỮ (trục chính) | Một cơ chế phủ cả 4 lỗi. Human-first tự nhiên (thẩm quyền = chữ ký bác sĩ) |
| **Customer Graph** | GIỮ, nhưng chỉ **retrieval** | Chống chôn vùi dữ kiện. KHÔNG cần graph DB — dữ liệu chỉ sâu 2 hop, Postgres đủ |
| **Compliance KB** | GIỮ, **định hình bản nháp** y lệnh | Tuân thủ nằm trong mặc định, không bắn cảnh báo → né alert fatigue |
| **EMR / điện tử hoá** | GIỮ làm nền | Điều kiện cần để validate. KHÔNG phải giải pháp cho "hồ sơ thiếu" (xem §6) |
| **CPOE (truyền y lệnh chính xác)** | GIỮ (nghĩa hẹp) | Đúng nghĩa gốc: loại lỗi y lệnh miệng/tam sao. KHÔNG mở rộng sang kê đơn an toàn |
| **Chatbot tư vấn KB** | HOÃN (sau 24h) | Pull không bắt được lỗi bỏ sót (xem §5). Tốn RAG, giá trị lõi thấp |
| **AI điều phối lịch** | HOÃN | Xếp lịch = CSP (OR-Tools), không phải LLM. "Phối hợp kém" là truyền tin sai, không phải xếp chỗ |
| **Neo4j / graph DB** | BỎ | Đã có graph qua FK. Traversal nông, cố định. Resume-driven |
| **CPOE kê đơn an toàn (drug interaction, liều)** | BỎ | Sản phẩm riêng, chuẩn riêng, làm sai giết người. Ngoài 24h |
| **Backfill checklist từ Synthea** | BỎ | Ý của advisor, kiến trúc không cần |

---

## 4. Kiến trúc chốt (3 sơ đồ)

### A. Toàn cảnh — 3 lớp, 2 loại kết nối

```
GIAO DIỆN THEO VAI:  Bác sĩ(viết/ký) · Trợ thủ(thực thi) · Lễ tân(lịch/recall/scan consent) · Quản lý(giám sát)
        │
   ═══► chính sách        Y LỆNH (vật thể trục)        dữ kiện ───► (chỉ đọc)
   COMPLIANCE KB      open→chuyển→thực thi→đóng bằng      CUSTOMER GRAPH
   (chuẩn tắc)              bằng chứng                    (mô tả, có PII→RLS)
   CÁI PHẢI LÀM         │ sinh alert khi treo             CÁI ĐÃ XẢY RA
   không PII            │                                 CHỈ truy xuất, KHÔNG suy luận
   ghi vào nháp    ENGINE ĐỐI CHIẾU (deterministic)            │ dựng từ
                   y lệnh mở không đóng = vi phạm → ALERT     EMR (nền, Synthea=seed)

Chú thích:  ═══► GHI VÀO (chính sách, áp mọi ca)   ───► CHỈ ĐỌC (dữ kiện ca này, bác sĩ tự nối)
```

**Câu chốt:** KB được chạm vào nội dung y lệnh vì là quy định chung; Graph KHÔNG được, vì chạm vào là suy luận hộ bác sĩ.

### B. Thời khắc viết y lệnh — nơi ranh giới sống

```
                    BÁC SĨ VIẾT Y LỆNH
   ───► (chỉ đọc)                          (ghi vào) ═══►
 PANEL BỐI CẢNH (từ Graph)              NHÁP Y LỆNH (từ KB)
 ┌ AN TOÀN: dị ứng, thuốc đang dùng     bước protocol điền sẵn theo thủ thuật:
 │  (query cứng, đủ 100%, KHÔNG qua LLM)  • CBCT trước implant  • consent phạm vi đúng
 └ BỆNH SỬ: tóm tắt 10 năm CÓ TRÍCH DẪN   • kháng sinh dự phòng • tái khám 7 ngày
    (LLM, chỉ retrieval, không kết luận)  (xoá bước bắt buộc → ghi exception có audit)
                    │
        BÁC SĨ ĐỌC PANEL → TỰ QUYẾT → KÝ
   (CHỈ bác sĩ nối panel với y lệnh; Graph không tự ghi)
```

### C. Vòng đời y lệnh + 3 hạng bước

```
Y LỆNH ban ra (OPEN) → hàng đợi đúng vai → người thực hiện làm

ĐÓNG THẾ NÀO? (ưu tiên từ trên xuống):
 ① BẤT BIẾN GIAO DIỆN → không thể bỏ   (dị ứng, tiệt trùng: luôn hiện/chặn cấu trúc, không tick)
 ② TỰ ĐÓNG BẰNG BẰNG CHỨNG → không ai tick  (phim→file, tái khám→lịch, consent→scan, đơn→bản ghi)
 ③ TICK (chỉ khi hết cách) → còn ít nên còn nghĩa

→ kết quả về HÀNG ĐỢI "chờ tôi xem" của bác sĩ (không ngắt bác sĩ đang làm ca khác)

NHÁNH LỖI: quá hạn mà y lệnh vẫn OPEN → engine phát hiện (query, deterministic) → ALERT
 = bỏ bước / thiếu hồ sơ / quên tái khám / mất referral  (3/4 vấn đề, cùng một truy vấn)
```

### D. Consent — gate đóng bằng bằng chứng có phạm vi (CHỐT)

Consent = **y lệnh con dạng cổng chặn**, không phải ô đính file. Vắt qua cả hạng ① (chặn giao diện) và ② (tự đóng bằng bằng chứng).

```
Y LỆNH thủ thuật (vd: nhổ răng R36)
   │ KB: nhóm này cần cam kết?  khám/cạo vôi/fluoride→KHÔNG ; nhổ/implant/nội nha/sinh thiết→CÓ
   ▼
 GATE CONSENT (y lệnh con, OPEN)  "ký cam kết cho [nhổ răng]"
   │ đóng KHI (hạng ②, KHÔNG tick) — tất cả:
   │   ✓ scan giấy ký đính vào
   │   ✓ phạm vi khớp theo NHÓM (procedure_type): cam kết "nhổ răng" phủ mọi mã nhổ; "implant"≠"nhổ"
   │   ✓ ngày ký < thời điểm làm thủ thuật            (chống ký lùi)
   │   ✓ người ký hợp lệ: tuổi(BIRTHDATE)<18 → đòi chữ ký giám hộ  (field: người ký = BN/giám hộ)
   ▼
 GATE ĐÓNG ──► thủ thuật được phép "đã thực hiện"   (hạng ①: gate mở thì KHÔNG đóng được thủ thuật)

 ✗ thủ thuật "đã làm" khi gate OPEN → VI PHẠM (cùng truy vấn: order con mở mà cha đóng)
    HOẶC bác sĩ FORCE cấp cứu + lý do bắt buộc → ngoại lệ có audit
```

- **Tái dùng schema:** khớp nhóm = `procedure_type` (checklist_rules đã seed theo trường này). Không cần map mới.
- **Chống gian:** scope-match theo nhóm khiến "đính đại một scan" không qua mặt được, nhưng không brittle như khớp mã 1-1 (giấy cam kết thật viết theo loại).
- **2 check phụ đều làm cho 24h:** timing (rẻ, deterministic) + signer (data có sẵn tuổi; consent thêm field "người ký").
- Một gate / một y lệnh thủ thuật cần cam kết (giữ đơn giản; không gộp form đa thủ thuật cho 24h).

---

## 5. Đặt AI ở đâu — và ở đâu KHÔNG

**CÓ AI (advisory, human-first):**
- **Bản tóm tắt bệnh sử (LLM)** — retrieval trung thành, mỗi câu trích dẫn encounter gốc, KHÔNG kết luận. Đây là "AI" rõ nhất để demo, chạy trên data Synthea thật.
- **KB định hình nháp y lệnh** — thực ra là rule engine (tái dùng checklist_rules), không phải LLM.

**KHÔNG AI (deterministic, không thể sai):**
- Dị ứng / thuốc đang dùng → **query cứng, luôn hiện, KHÔNG qua LLM.** Vì LLM sót thì không có trích dẫn nào để kiểm (automation bias). Thứ giết người không đi qua thứ có thể quên.
- Phát hiện vi phạm → query trạng thái y lệnh.
- Chống trùng lịch → tstzrange (đã có).

**Nguyên tắc pull vs push:** Lỗi bỏ sót VÔ HÌNH với công cụ pull (chatbot), vì người sắp quên không biết để đi hỏi. → Compliance phải PUSH (định hình nháp tại thời điểm viết). Chatbot chỉ hợp cho việc người ta *biết mình có câu hỏi* (đào tạo, ngoại lệ, giải thích why) → hoãn.

---

## 6. Điểm pitch cần cẩn thận

- **KHÔNG nói "số hoá chữa hồ sơ thiếu".** Bằng chứng ngược: dataset này 100% điện tử mà vẫn có ca thiếu phim/sinh hiệu. Nói: "EMR là nền; lớp tuân thủ trên nó mới làm hồ sơ đầy đủ." Chặn được đòn "EMR 30 năm rồi sao vẫn thiếu?".
- **KHÔNG gọi trigger SQL là 'agent'.** Sẽ bị hỏi và lộ.
- **Câu mạnh:** "Chúng tôi không để LLM chịu trách nhiệm nhớ bệnh nhân dị ứng gì — đó là truy vấn, và truy vấn không quên." → dấu hiệu hiểu domain.
- **Verify số hiệu văn bản pháp lý VN trước khi lên slide** (Luật KBCB 15/2023/QH15, TT 32/2023/TT-BYT, NĐ 13/2023/NĐ-CP — CHƯA xác minh chắc chắn, phải tự tra).

---

## 7. Vai trò dataset Synthea

- **Bản địa hoá:** ĐÃ Việt-hóa lớp nhân khẩu (tên, địa chỉ, dân tộc `kinh`, SSN dạng CCCD, chi phí VND, cơ sở/bác sĩ tiếng Việt). Lâm sàng giữ SNOMED. **2 caveat data:** (a) địa lý chắp vá — cả nước chỉ 7 quận/huyện gán ngẫu nhiên, không khớp tỉnh (thẩm mỹ, giám khảo VN soi được); (b) chuyên khoa bác sĩ bị ép đồng loạt thành RHM → KHÔNG lọc ca nha khoa theo `SPECIALITY`.
- **KHÔNG load 3.34GB.** Lấy ~30–50 bệnh nhân bệnh sử dày, **nạp trọn record** (không lọc theo encounter nha khoa — xem 3-lane). Được bỏ `observations` 1.5GB vì dung lượng, MIỄN giữ `allergies` + `medications` cho Lane an toàn. → ~20MB.
- **Chọn ca giàu bối cảnh:** 321 implant, 27 viêm quanh implant, 15 ung thư khoang miệng — nơi AI briefing toả sáng (bệnh sử nhiều tầng không ai đọc kịp).
- **Giới hạn cứng (README):** không có dữ liệu từng răng, không có CDT, không có y lệnh (careplans là gần nhất). → Y lệnh do bác sĩ tự viết, KHÔNG relate dataset, KHÔNG cần fake.

### 7.1. Customer Graph — lọc phạm vi nha khoa (mô hình 3-lane)

**Không có MỘT phạm vi.** Ranh giới nha khoa xuất hiện ở 3 lane, mỗi lane câu trả lời khác — 1 lane mà lọc nha khoa là NGUY HIỂM.

| Lane | Phạm vi | Cơ chế | Vì sao |
|---|---|---|---|
| **1. Panel an toàn** (dị ứng/thuốc/bệnh nền) | **TOÀN THÂN, không lọc nha** | Hard-query deterministic, KHÔNG qua LLM | Warfarin ghi ở khám tim mạch nhưng gây chảy máu khi nhổ răng. Lọc nha = giấu đúng thứ chết người |
| **2. Tóm tắt lịch sử** | **Lọc nha** (whitelist SNOMED) | LLM tóm tắt có trích dẫn | Nha sĩ cần "răng đã trải qua gì", không cần tiền sử sản khoa. Lọc còn làm LLM sạch/gọn hơn để demo |
| **3. Vận hành/CRM** | Thuần nha | Deterministic | Nhắc tái khám, theo dõi hậu điều trị — chỉ nha |

**Bắc cầu bệnh nền liên quan nha (chốt: ĐƯA VÀO 24h, danh sách rút gọn ~6–8):**
Một số bệnh nền *phi nha* đổi cách làm răng: chống đông, bisphosphonate (MRONJ), tiểu đường (lành nha chu), thai kỳ, rối loạn đông máu, suy giảm miễn dịch. Giữ đúng ranh giới **retrieval vs inference**:
- **KB định nghĩa** *danh sách* bệnh nền nào liên quan nha → chính sách, không suy luận về BN.
- **Graph truy xuất** BN này có trong danh sách không → sự thật đã ghi, không suy luận.
- **Bác sĩ bắc cầu** → tự rút kết luận. Hệ thống chỉ **đẩy sự thật lên panel an toàn (bất biến giao diện)**, KHÔNG phán "cân nhắc bắc cầu chống đông" (suy luận lâm sàng = cấm).
- Pitch: *"Graph biết BN gãy xương hông nhưng không làm rối màn hình — TRỪ warfarin, vì nó đổi cách nhổ răng."* AI có phán đoán MỨC liên quan (do KB, audit được), không lọc mù.

**Hệ quả nạp liệu:** tiền lọc thành subset nha khoa lúc nạp = SAI (cắt mất sự thật an toàn toàn thân). → nạp trọn, lọc lúc đọc theo lane.

**Bộ mã SNOMED nha khoa (chốt: trích từ 6 module JSON tại `E:/Documents/VAIC 2026/synthea/modules/`):**
- 6 module tổng ~245 lượt mã thô (periodontal 64, oral_cancer 45, endodontics 44, implant 37, ortho 36, tmj 19). Sau khử trùng + loại còn ~100–150 mã nha distinct + mã sâu răng/khám/fluoride cơ bản.
- **Caveat trích:** module CÓ chứa mã bệnh nền tham chiếu (vd `44054006 Diabetes type 2` trong periodontal). Phải tách: mã ở state Procedure/Condition nha → whitelist Lane 2; mã bệnh nền tham chiếu → gợi ý cho danh sách Lane 1 (bonus, nhưng danh sách cuối do lâm sàng chốt vì chống đông/bisphosphonate nằm ở `medications`).

---

## 8. Rủi ro & giảm nhẹ

| Rủi ro | Mức | Giảm nhẹ |
|---|---|---|
| **24h không đủ** | Cao | Thứ tự: y lệnh → briefing → đối chiếu+alert → KB draft. KB là đường cắt cuối |
| **Ma sát bác sĩ (2-3 lần gõ/ca)** | Cao | AI draft + KB điền sẵn. Đây là sinh tử: bác sĩ bỏ hệ thống → mọi lớp trên thành trang trí |
| **Automation bias (briefing sót)** | Cao | An toàn = query cứng, LLM chỉ diễn giải + trích dẫn |
| **Alert fatigue (CDSS chết kinh điển)** | Cao | KB định hình nháp (không bắn cảnh báo); chỉ cảnh báo khi xoá bước luật buộc |
| **Load dataset ngốn giờ** | Trung | Subset ~50 BN, bỏ observations |
| **Không có ai biết vận hành nha thật** | Cao | Hỏi DentalTech JSC / người trong nghề trước khi chốt luồng |

---

## 9. Câu hỏi mở CHƯA chốt

1. **compliance_score — ĐÃ CHỐT: BỎ.** Không chấm điểm/phần trăm. Lý do: chấm *người* → checkbox theater (Goodhart); engine đã có sẵn compliance miễn phí = "y lệnh mở không đóng = vi phạm", đếm được, per-case. Danh sách vi phạm treo cụ thể hơn, khó gian hơn, defensible hơn con số. "Chấm ai": *người*=bỏ; *ca*=trạng thái (xong/còn N treo), không phải điểm; *phòng khám theo thời gian*=chỉ giữ nếu tính thuần từ bằng chứng. Bản 24h: **chỉ danh sách vi phạm treo, không số nào.** Câu trả lời giám khảo "đo cải thiện thế nào": không chấm người, đếm vi phạm treo + (dự phòng) tỷ lệ evidence-vs-tick. Việc TỪ CHỐI chấm người = dấu hiệu hiểu nghề. Ý evidence-vs-tick giữ làm dự phòng nếu cần "con số", không làm cho 24h.
2. **Consent — ĐÃ CHỐT & đặt vào vòng đời (xem §4.D).** Thực thể riêng, đính scan giấy ký (KHÔNG e-signature). Mô hình: gate order con của y lệnh thủ thuật, KB sinh có điều kiện theo nhóm; đóng bằng bằng chứng khi scan + khớp nhóm procedure_type + ngày ký trước khi làm + đúng người ký (vị thành niên→giám hộ); chặn thủ thuật đóng khi gate mở; force cấp cứu + lý do có audit; vi phạm rơi vào cùng truy vấn deterministic.
3. **"Truyền xuống dưới"** — luồng vai trò chi tiết: bác sĩ ký xong ai thấy gì. Hàng đợi lễ tân quan trọng nhất (bất đồng bộ bác sĩ↔lễ tân). Chưa vẽ UI từng vai.
4. **Ai gõ:** đã chốt bác sĩ tự gõ tự ký. Kéo theo yêu cầu AI draft phải cực tiện.

---

## 10. Luồng một ca (tổng thể)

```
khám → chẩn đoán sơ bộ → Y LỆNH #1 (chụp/xét nghiệm) → hàng đợi thực thi
     → bằng chứng về → hàng đợi "chờ tôi xem" bác sĩ → chẩn đoán xác định
     → Y LỆNH #2 (thủ thuật; KB điền sẵn; consent gắn scan) → thực thi
     → Y LỆNH #3 (tái khám) → lễ tân
```
Y lệnh là VÒNG, không phải một phát. Nhiều y lệnh/encounter, ban dần khi chẩn đoán rõ dần. Mỗi mũi tên "chuyển đi" = một bàn giao; mỗi y lệnh treo = một lỗi phối hợp bị bắt.

---

## 11. Tiêu chí thành công (demo)

- Chạy AI briefing trên ≥1 ca Synthea giàu bối cảnh, có trích dẫn nguồn, panel dị ứng query cứng.
- Bác sĩ viết được y lệnh với KB điền sẵn theo thủ thuật; xoá bước buộc → ghi exception.
- Engine phát hiện ≥1 loại "y lệnh treo" và bắn alert (deterministic).
- Pitch phân biệt rõ: AI đề xuất/kể chuyện — engine thi hành — người quyết.

## 12. Bước tiếp theo

1. Chốt compliance_score (chấm gì để không phản tác dụng).
2. Chia scope 24h chi tiết (thật/slide, thứ tự dựng) → `/ck:plan`.
3. Verify văn bản pháp lý VN.
4. (Nếu được) hỏi người vận hành nha thật để chốt luồng vai trò.
```
