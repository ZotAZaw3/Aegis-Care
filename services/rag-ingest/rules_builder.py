"""
Stage: requirement chuẩn hóa -> rule kiểm tra -> mapping với trường dữ liệu hệ thống.

Input : output/requirements.csv
Output: rules.json, rule_evidence_mapping.csv

Lưu ý quan trọng: bước "mapping với trường dữ liệu hệ thống" đòi hỏi kiến
thức nghiệp vụ cụ thể (CRM Customer Graph / CPOE dùng field nào) mà pipeline
KHÔNG thể tự suy ra chính xác chỉ từ văn bản luật. Vì vậy script này chỉ:
  1. Tạo khung rule (draft) theo 1 DSL đơn giản (field/operator/value/action),
     với field còn để "<TBD>" và status="draft_needs_review" - đội compliance
     phải xác nhận/điền field thật trước khi đưa vào production.
  2. Gợi ý (suggested_tables) bảng dữ liệu Synthea có khả năng liên quan, dựa
     theo từ khóa - CHỈ là gợi ý, không phải mapping đã xác minh.
  3. Seed 1 rule mẫu đã hoàn thiện đầy đủ (ví dụ "consent trước thủ thuật" lấy
     từ chính đề bài) để đội có 1 khuôn mẫu cụ thể khi tự điền các rule khác.
"""
import csv
import json
import os

import config

RULE_ACTION_BY_OBLIGATION = {
    "MUST": "FAIL_IF_NOT_DONE",
    "MUST_NOT": "FAIL_IF_DONE",
    "CONDITIONAL": "WARN_IF_ORDER_VIOLATED",
}

SEED_EXAMPLE_RULE = {
    "rule_id": "RULE_SEED_001",
    "requirement_id": None,
    "source": "Ví dụ minh họa từ đề bài (không tự động sinh từ văn bản)",
    "citation": "Nguyên tắc chung về consent trong khám bệnh, chữa bệnh",
    "description": "Phải có consent (giấy đồng ý) hợp lệ trước khi thực hiện thủ thuật.",
    "obligation_type": "MUST",
    "condition": {
        "logic": "AND",
        "checks": [
            {"field": "procedure_completed", "operator": "==", "value": True},
            {"field": "valid_consent", "operator": "==", "value": False},
        ],
    },
    "action": "FAIL",
    "message": "Thủ thuật đã hoàn tất nhưng chưa có consent hợp lệ được ghi nhận.",
    "suggested_tables": ["procedures", "careplans"],
    "field_mapping_notes": (
        "procedure_completed co the lay tu procedures.csv (STOP date khong rong). "
        "valid_consent CHUA CO san trong du lieu Synthea (README da neu: khong co bang "
        "consent) - can bo sung truong nay trong Customer Graph / CRM thuc te truoc khi "
        "rule nay chay duoc that."
    ),
    "status": "verified_example",
}


def build_rules():
    requirements = []
    with open(os.path.join(config.OUTPUT_DIR, "requirements.csv"), encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            requirements.append(row)

    rules = [SEED_EXAMPLE_RULE]
    mapping_rows = []

    for req in requirements:
        rule_id = f"RULE{req['requirement_id'][3:]}"
        action = RULE_ACTION_BY_OBLIGATION.get(req["obligation_type"], "WARN")
        suggested_tables = [t for t in req["suggested_tables"].split(";") if t]

        rule = {
            "rule_id": rule_id,
            "requirement_id": req["requirement_id"],
            "source": f"{req['so_hieu']} - Điều {req['dieu_so']}"
                      + (f" Khoản {req['khoan_so']}" if req["khoan_so"] else ""),
            "citation": req["requirement_text"],
            "description": req["requirement_text"],
            "obligation_type": req["obligation_type"],
            "condition": {
                "logic": "AND",
                "checks": [
                    {"field": "<TBD_field_can_xac_nhan>", "operator": "<TBD>", "value": "<TBD>"},
                ],
            },
            "action": action,
            "message": f"Vi pham yeu cau tai {req['so_hieu']} Dieu {req['dieu_so']}"
                       + (f" Khoan {req['khoan_so']}" if req["khoan_so"] else "") + ".",
            "suggested_tables": suggested_tables,
            "field_mapping_notes": (
                "Draft tu dong sinh tu tu khoa trong van ban - CAN doi compliance xac nhan "
                "field he thong that va cap nhat condition truoc khi dua vao san xuat."
                if suggested_tables else
                "Khong tim thay bang du lieu Synthea nao khop tu khoa - can doi ngu tu xac dinh "
                "nguon du lieu he thong lien quan (co the ngoai pham vi CSV hien co)."
            ),
            "status": "draft_needs_review",
        }
        rules.append(rule)

        mapping_rows.append({
            "rule_id": rule_id,
            "requirement_id": req["requirement_id"],
            "clause_id": req["clause_id"],
            "doc_id": req["doc_id"],
            "so_hieu": req["so_hieu"],
            "dieu_so": req["dieu_so"],
            "khoan_so": req["khoan_so"],
            "citation_text": req["requirement_text"],
            "suggested_system_tables": req["suggested_tables"],
            "mapped_field_status": "chua_xac_dinh" if suggested_tables else "can_bo_sung_nguon_du_lieu",
            "confidence": "low_heuristic",
            "page_start": req["page_start"],
            "page_end": req["page_end"],
            "status": "draft_needs_review",
        })

    rules_path = os.path.join(config.OUTPUT_DIR, "rules.json")
    with open(rules_path, "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)

    mapping_path = os.path.join(config.OUTPUT_DIR, "rule_evidence_mapping.csv")
    fieldnames = list(mapping_rows[0].keys()) if mapping_rows else []
    with open(mapping_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(mapping_rows)

    print(f"[rules] {len(requirements)} requirements -> {len(rules)} rules (bao gom 1 seed example)")
    print(f"[rules] wrote {rules_path}")
    print(f"[rules] wrote {mapping_path}")
    return rules


if __name__ == "__main__":
    build_rules()
