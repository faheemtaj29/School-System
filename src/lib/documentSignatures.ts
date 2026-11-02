export const DOCUMENT_SIGNATURES = [
  { role: "principal", label: "Principal / Head" },
  { role: "classTeacher", label: "Class Teacher" },
  { role: "examController", label: "Controller of Exams" },
  { role: "accountant", label: "Accountant" },
  { role: "preparedBy", label: "Prepared By" },
  { role: "checkedBy", label: "Checked By" },
  { role: "approvedBy", label: "Approved By" },
  { role: "storeKeeper", label: "Store Keeper" },
  { role: "receiver", label: "Receiver" },
] as const;

export type DocumentSignatureRole = (typeof DOCUMENT_SIGNATURES)[number]["role"];
export type DocumentSignatureUrls = Partial<Record<DocumentSignatureRole, string>>;
