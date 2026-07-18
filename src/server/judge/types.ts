// Kiểu dữ liệu Compliance Judge (dùng chung server + client).
// hard_findings = Lớp A tất định (thẩm quyền). advisories = Lớp B RAG (phải người kiểm).

export type HardFindingType = "missing_mandatory" | "consent_missing" | "safety_flag" | "observation_fact";
export type Severity = "high" | "medium" | "info";

export interface HardFinding {
  type: HardFindingType;
  severity: Severity;
  message: string; // fact-only, không kết luận lâm sàng
  ref?: string; // rule id hoặc nhãn cờ (để UI/audit)
}

export interface Citation {
  citation: string; // "Tên/số hiệu văn bản — Điều/Khoản"
  page: number | null;
  chunk_id: string; // định danh chunk đã kiểm (không phải citation ma)
}

export interface Advisory {
  message: string;
  citations: Citation[];
}

export interface Insufficient {
  topic: string;
  note: string;
}

export interface JudgeResult {
  hard_findings: HardFinding[];
  advisories: Advisory[];
  insufficient: Insufficient[];
  verdict: "clean" | "has_findings";
}

export interface JudgeDecision {
  rule_id: string;
  keep: boolean;
  reason?: string;
}
