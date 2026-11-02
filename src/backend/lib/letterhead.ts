/**
 * The header printed on every document — school name, campus, address, phone, email and
 * logo. A campus's own details and logo win; anything it leaves blank comes from the school
 * profile. Set once in Settings, used by challans, receipts, results, date sheets, vouchers,
 * ledgers, certificates and notices alike.
 */
import { Settings } from "@/backend/models/Settings";
import type { DocumentSignatureRole, DocumentSignatureUrls } from "@/lib/documentSignatures";

export type Letterhead = {
  name: string;
  campus: string;
  campusCode: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  signatures: DocumentSignatureUrls;
  registrationNo: string;
  currency: string;
  logoUrl: string | null;
};

type BranchLean = { code: string; name: string; address?: string; phone?: string; email?: string; logoUpdatedAt?: Date };

/** Loads settings once and returns a lookup by campus code (for documents that span campuses). */
export async function letterheads() {
  const s = await Settings.findOne()
    .select("schoolName address phone email website logoUpdatedAt branches defaultBranchCode registrationNo currency +documentSignatures")
    .lean();
  const documentSignatures = s?.documentSignatures as
    | Partial<Record<DocumentSignatureRole, { updatedAt?: Date | string }>>
    | undefined;
  const branches = (s?.branches || []) as BranchLean[];
  const schoolLogo = s?.logoUpdatedAt ? `/api/settings/logo?v=${new Date(s.logoUpdatedAt).getTime()}` : null;
  return (branchCode?: string | null): Letterhead => {
    const code = String(branchCode || s?.defaultBranchCode || branches[0]?.code || "").toUpperCase();
    const b = branches.find((x) => x.code === code);
    return {
      name: s?.schoolName || "School",
      campus: b?.name || "",
      campusCode: code,
      address: b?.address || s?.address || "",
      phone: b?.phone || s?.phone || "",
      email: b?.email || s?.email || "",
      website: s?.website || "",
      signatures: Object.fromEntries(
        Object.entries(documentSignatures || {}).flatMap(([role, signature]) =>
          signature?.updatedAt
            ? [[role, `/api/settings/signature?role=${role}&v=${new Date(signature.updatedAt).getTime()}`]]
            : []
        )
      ) as DocumentSignatureUrls,
      registrationNo: s?.registrationNo || "",
      currency: s?.currency || "PKR",
      logoUrl: b?.logoUpdatedAt
        ? `/api/settings/logo?branch=${encodeURIComponent(code)}&v=${new Date(b.logoUpdatedAt).getTime()}`
        : schoolLogo,
    };
  };
}

/** The letterhead for one campus (the default campus when none is given). */
export async function letterhead(branchCode?: string | null) {
  return (await letterheads())(branchCode);
}
