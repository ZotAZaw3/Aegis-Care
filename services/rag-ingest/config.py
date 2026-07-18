"""Cấu hình chung cho Compliance Knowledge Pipeline (Pipeline 1)."""
import os

from dotenv import load_dotenv

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_THIS_DIR, ".env"))

# Sau khi di chuyển thư mục này vào services/rag-ingest/, thư mục cha là
# services/ (KHÔNG còn chứa PDF nguồn). PDF corpus nằm ở <repo>/data/compliance.
# REPO_ROOT = cha của services/ = _THIS_DIR/../..  -> trỏ PDF_DIR tường minh.
REPO_ROOT = os.path.dirname(os.path.dirname(_THIS_DIR))
OUTPUT_DIR = os.path.join(_THIS_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Metadata biết trước về 5 văn bản nguồn (đã xác minh qua đọc toàn văn).
# doc_id là khóa nối xuyên suốt mọi file output.
DOCUMENTS = [
    {
        "doc_id": "LAW_15_2023_KCB",
        "file_name": "LAW_15_2023_KCB.pdf",
        "ten_van_ban": "Luật Khám bệnh, chữa bệnh",
        "so_hieu": "15/2023/QH15",
        "loai_van_ban": "Luật",
        "co_quan_ban_hanh": "Quốc hội",
        "ngay_ban_hanh": "2023-01-09",
        "ngay_hieu_luc": "2024-01-01",
    },
    {
        "doc_id": "LAW_51_2024_BHYT_AMD",
        "file_name": "LAW_51_2024_BHYT_AMD.pdf",
        "ten_van_ban": "Luật sửa đổi, bổ sung một số điều của Luật Bảo hiểm y tế",
        "so_hieu": "51/2024/QH15",
        "loai_van_ban": "Luật",
        "co_quan_ban_hanh": "Quốc hội",
        "ngay_ban_hanh": "2024-11-27",
        "ngay_hieu_luc": "2025-07-01",
    },
    {
        "doc_id": "QD_2772_2020_RHMTW",
        "file_name": "QD_2772_2020_RHMTW.pdf",
        "ten_van_ban": "Quy chế Tổ chức và Hoạt động của Bệnh viện Răng Hàm Mặt Trung ương Hà Nội",
        "so_hieu": "2772/QĐ-BYT",
        "loai_van_ban": "Quyết định",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2020-07-01",
        "ngay_hieu_luc": "2020-07-01",
    },
    {
        "doc_id": "TT_12_2026_BTC",
        "file_name": "TT_12_2026_BTC.pdf",
        "ten_van_ban": (
            "Thông tư quy định trình tự, thủ tục giám định chi phí khám bệnh, "
            "chữa bệnh bảo hiểm y tế, biểu mẫu tổng hợp thanh toán, quyết toán "
            "và biện pháp thi hành Nghị định số 188/2025/NĐ-CP"
        ),
        "so_hieu": "12/2026/TT-BTC",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Tài chính",
        "ngay_ban_hanh": "2026-02-10",
        "ngay_hieu_luc": "2026-02-10",
    },
    {
        "doc_id": "TT_25_2025_BYT",
        "file_name": "TT_25_2025_BYT.pdf",
        "ten_van_ban": (
            "Thông tư quy định chi tiết thi hành Luật Bảo hiểm xã hội, Luật An "
            "toàn, vệ sinh lao động thuộc lĩnh vực y tế và một số điều của "
            "Luật Khám bệnh, chữa bệnh"
        ),
        "so_hieu": "25/2025/TT-BYT",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2025-06-30",
        "ngay_hieu_luc": "2025-07-01",
    },
    {
        "doc_id": "SOP_01_2026_DENTALTECH",
        "file_name": "SOP_01_2026_DENTALTECH.pdf",
        "ten_van_ban": "Quy trình vận hành lâm sàng và kiểm soát chất lượng nội bộ - DentalTech JSC",
        "so_hieu": "01/2026/QT-DENTALTECH",
        "loai_van_ban": "Quy trình nội bộ",
        "co_quan_ban_hanh": "DentalTech JSC (tự soạn, dựa trên QĐ 2121/QĐ-BYT, TT 16/2018/TT-BYT, QĐ 6858/QĐ-BYT)",
        "ngay_ban_hanh": "2026-07-17",
        "ngay_hieu_luc": "2026-07-17",
    },
    {
        "doc_id": "TT_13_2025_BYT_HSBADT",
        "file_name": "Thong_tu_13_2025_TT_BYT_ho_so_benh_an_dien_tu.pdf",
        "ten_van_ban": "Thông tư hướng dẫn triển khai hồ sơ bệnh án điện tử",
        "so_hieu": "13/2025/TT-BYT",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2025-06-06",
        "ngay_hieu_luc": "2025-06-06",
    },
    {
        "doc_id": "TT_16_2018_BYT_KSNK",
        "file_name": "Thong_tu_16_2018_TT_BYT_kiem_soat_nhiem_khuan.pdf",
        "ten_van_ban": "Thông tư quy định về kiểm soát nhiễm khuẩn trong các cơ sở khám bệnh, chữa bệnh",
        "so_hieu": "16/2018/TT-BYT",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2018-07-20",
        "ngay_hieu_luc": "2018-10-01",
    },
    {
        "doc_id": "TT_23_2011_BYT_SDT",
        "file_name": "Thong_tu_23_2011_TT_BYT_su_dung_thuoc.pdf",
        "ten_van_ban": "Thông tư hướng dẫn sử dụng thuốc trong các cơ sở y tế có giường bệnh",
        "so_hieu": "23/2011/TT-BYT",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2011-06-10",
        "ngay_hieu_luc": "2011-06-10",
    },
    {
        "doc_id": "TT_26_2025_BYT_DT",
        "file_name": "Thong_tu_26_2025_TT_BYT_don_thuoc.pdf",
        "ten_van_ban": (
            "Thông tư quy định về đơn thuốc và việc kê đơn thuốc hóa dược, "
            "sinh phẩm trong điều trị ngoại trú tại cơ sở khám bệnh, chữa bệnh"
        ),
        "so_hieu": "26/2025/TT-BYT",
        "loai_van_ban": "Thông tư",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2025-06-30",
        "ngay_hieu_luc": "2025-06-30",
    },
    {
        "doc_id": "QD_6858_2016_BYT_83TC",
        "file_name": "Bộ 83 tiêu chí đánh giá chất lượng bệnh viện.pdf",
        "ten_van_ban": "Bộ tiêu chí chất lượng bệnh viện Việt Nam (phiên bản 2.0)",
        "so_hieu": "6858/QĐ-BYT",
        "loai_van_ban": "Quyết định",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "2016-11-18",
        "ngay_hieu_luc": "2016-11-18",
    },
    {
        "doc_id": "MAU_13_BENH_AN_RHM",
        "file_name": "13_benh_an_rang_ham_mat_21820259.pdf",
        "ten_van_ban": "Mẫu bệnh án Răng - Hàm - Mặt (nội trú)",
        "so_hieu": "13/BV-01",
        "loai_van_ban": "Mẫu biểu chuẩn",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "",
        "ngay_hieu_luc": "",
    },
    {
        "doc_id": "MAU_16_BENH_AN_NGOAI_TRU_RHM",
        "file_name": "16_benh_an_ngoai_tru_rang_ham_mat_21820259.pdf",
        "ten_van_ban": "Mẫu bệnh án ngoại trú chuyên khoa Răng Hàm Mặt",
        "so_hieu": "16/BV-01",
        "loai_van_ban": "Mẫu biểu chuẩn",
        "co_quan_ban_hanh": "Bộ Y tế",
        "ngay_ban_hanh": "",
        "ngay_hieu_luc": "",
    },
]

# PDF nguồn (13 file) sống ở <repo>/data/compliance (tách khỏi cây services/).
PDF_DIR = os.path.join(REPO_ROOT, "data", "compliance")

# Chunking
MAX_CHUNK_CHARS = 1200
CHUNK_OVERLAP_CHARS = 150

# Embedding
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM_FALLBACK = 512  # TF-IDF fallback max_features

# Generation (lớp RAG - sinh câu trả lời có trích dẫn từ chunk lấy về)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "5"))

# Requirement-mining keywords (tiếng Việt, văn bản pháp luật/y tế)
MUST_KEYWORDS = [
    "phải", "có trách nhiệm", "có nghĩa vụ", "bắt buộc phải",
    "yêu cầu phải", "cần phải",
]
MUST_NOT_KEYWORDS = [
    "không được", "nghiêm cấm", "cấm ", "không được phép",
]
CONDITIONAL_KEYWORDS = [
    "trước khi", "sau khi", "trong thời hạn", "chỉ được",
]

# Gợi ý ánh xạ từ khóa -> bảng dữ liệu hệ thống (dựa trên các bảng CSV Synthea sẵn có)
TABLE_KEYWORD_HINTS = {
    "patients": ["bệnh nhân", "người bệnh", "nhân khẩu"],
    "encounters": ["lượt khám", "khám bệnh", "tiếp nhận", "hồ sơ bệnh án", "chuyển tuyến"],
    "conditions": ["chẩn đoán", "bệnh lý"],
    "procedures": ["thủ thuật", "phẫu thuật", "can thiệp", "điều trị"],
    "observations": ["xét nghiệm", "chỉ số", "sinh hiệu", "dấu hiệu sinh tồn"],
    "medications": ["thuốc", "đơn thuốc", "kê đơn"],
    "imaging_studies": ["chẩn đoán hình ảnh", "chụp x-quang", "x quang", "phim"],
    "devices": ["khí cụ", "thiết bị", "cấy ghép", "implant"],
    "careplans": ["kế hoạch điều trị", "phác đồ"],
    "allergies": ["dị ứng"],
    "immunizations": ["tiêm chủng", "vắc xin"],
    "supplies": ["vật tư"],
    "payers": ["bảo hiểm", "bhyt", "chi trả"],
    "patient_expenses": ["chi phí", "thanh toán", "viện phí"],
}
