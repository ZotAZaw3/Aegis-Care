"""
Luồng RAG hoàn chỉnh (retrieval + generation):

    cảnh báo/câu hỏi -> tìm Điều/Khoản liên quan (rag.py, vector store local)
                     -> trả lời tổng hợp bằng OpenAI gpt-4o-mini (answer_generator.py)
                     -> citation: văn bản, điều, khoản, trang

Nếu chưa điền OPENAI_API_KEY trong .env, script vẫn chạy được và chỉ in kết
quả retrieval thô (không lỗi) - generation sẽ tự bật lên ngay khi có key.

Usage:
    python ask.py "Phải có consent hợp lệ trước khi thực hiện thủ thuật không?"
"""
import sys

import config
from rag import ComplianceRAG


def ask(query: str, top_k: int = None):
    rag = ComplianceRAG()
    results = rag.search(query, top_k=top_k or config.RAG_TOP_K)

    print(f"\n=== Ket qua tim kiem (retrieval) cho: {query} ===")
    for r in results:
        print(f"  [{r['score']:.3f}] {r['citation']} (trang {r['page_start']}-{r['page_end']})")

    if not config.OPENAI_API_KEY:
        print("\n[luu y] Chua co OPENAI_API_KEY trong file .env - chi hien ket qua retrieval o tren.")
        print(f"Dien OPENAI_API_KEY vao .env de bat generation bang model {config.OPENAI_MODEL}.")
        return {"query": query, "results": results, "answer": None}

    from answer_generator import generate_answer
    generated = generate_answer(query, results)
    print(f"\n=== Cau tra loi ({generated['model']}) ===")
    print(generated["answer"])
    return generated


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or "Phải có consent hợp lệ trước khi thực hiện thủ thuật không?"
    ask(q)
