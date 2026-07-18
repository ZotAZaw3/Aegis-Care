"""
Bước generation của lớp RAG: từ các chunk đã retrieve (rag.py), gọi OpenAI
(gpt-4o-mini mặc định, cấu hình qua .env) để tổng hợp câu trả lời CÓ TRÍCH DẪN.

    cảnh báo/câu hỏi -> (rag.py) tìm Điều/Khoản liên quan
                     -> (answer_generator.py) trả lời + citation: văn bản, điều, khoản, trang

An toàn tuân thủ: model chỉ được trả lời dựa trên context lấy từ vector store,
không được dùng kiến thức ngoài / suy diễn thêm, và phải khai báo rõ khi
không tìm thấy quy định liên quan - tránh bịa nội dung pháp lý.
"""
import config

SYSTEM_PROMPT = (
    "Bạn là trợ lý tra cứu tuân thủ cho phòng khám nha khoa (Clinic Operation System). "
    "CHỈ được trả lời dựa trên các đoạn trích quy định trong CONTEXT bên dưới - "
    "tuyệt đối không dùng kiến thức ngoài, không suy diễn hay bổ sung nội dung "
    "không có trong CONTEXT.\n\n"
    "QUAN TRỌNG - không suy diễn sai chiều: một số đoạn trích chỉ LIỆT KÊ đối "
    "tượng/sự việc (ví dụ liệt kê danh sách thiết bị, danh sách trường hợp) mà "
    "KHÔNG tự nêu rõ kết luận áp dụng cho câu hỏi (được/không được, phải/không "
    "phải, cấm/cho phép, có/không). Nếu đoạn trích không chứa TỪ NGỮ KẾT LUẬN "
    "rõ ràng khớp với câu hỏi (ví dụ: 'được hưởng', 'không được hưởng', 'phải', "
    "'nghiêm cấm', 'không được phép'), TUYỆT ĐỐI KHÔNG được tự suy ra đó là "
    "'có' hay 'không' chỉ vì đối tượng được nhắc tới trong danh sách. Trong "
    "trường hợp này phải trả lời: \"Ngữ cảnh hiện có chỉ đề cập/liệt kê nội "
    "dung liên quan nhưng KHÔNG nêu rõ kết luận - cần đối chiếu thêm với văn "
    "bản gốc trước khi khẳng định\", kèm trích dẫn đoạn đó để người dùng tự "
    "kiểm tra. Nếu 1 đoạn trích có ghi chú \"(nội dung sửa đổi Điều X của văn "
    "bản gốc)\", phải nói rõ trong câu trả lời rằng cần xem đúng Điều X gốc để "
    "hiểu đầy đủ ý nghĩa, không tự suy diễn ý nghĩa của Điều X đó.\n\n"
    "Nếu CONTEXT không có đoạn nào liên quan, phải nói rõ "
    "\"Không tìm thấy quy định liên quan trong tài liệu hiện có\", không được đoán.\n\n"
    "Trả lời ngắn gọn, đúng trọng tâm. Sau mỗi ý, trích dẫn nguồn theo định dạng: "
    "(Tên văn bản, số hiệu - Điều X, Khoản Y, trang Z)."
)


def _build_context_block(results: list) -> str:
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(
            f"[{i}] {r['citation']} (trang {r['page_start']}-{r['page_end']})\n{r['text']}"
        )
    return "\n\n".join(lines)


def generate_answer(query: str, results: list) -> dict:
    if not config.OPENAI_API_KEY:
        raise RuntimeError(
            "Chưa có OPENAI_API_KEY. Điền key thật vào file .env (biến OPENAI_API_KEY) "
            "trước khi gọi generate_answer()."
        )
    if not results:
        return {
            "query": query, "answer": "Không tìm thấy quy định liên quan trong tài liệu hiện có.",
            "citations": [], "model": config.OPENAI_MODEL,
        }

    from openai import OpenAI
    client = OpenAI(api_key=config.OPENAI_API_KEY)

    context_block = _build_context_block(results)
    user_prompt = f"CONTEXT:\n{context_block}\n\nCÂU HỎI: {query}"

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
    )
    answer_text = response.choices[0].message.content

    return {
        "query": query,
        "answer": answer_text,
        "citations": [
            {
                "citation": r["citation"], "chunk_id": r["chunk_id"],
                "page_start": r["page_start"], "page_end": r["page_end"],
            }
            for r in results
        ],
        "model": config.OPENAI_MODEL,
    }
