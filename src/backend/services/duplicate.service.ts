/**
 * Duplicate detection for invoices and transactions.
 */
import { dbConnect } from "@/backend/config/database";
import { Voucher } from "@/backend/models/Accounting";
import { ServiceError } from "@/backend/types";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingVoucherId?: string;
  existingVoucherNumber?: string;
  matchScore: number;
  matchedFields: string[];
}

export const duplicateService = {
  async checkInvoice({
    partyName,
    invoiceNumber,
    invoiceDate,
    amount,
    taxAmount,
    voucherType,
    branchCode,
  }: {
    partyName?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount?: number;
    taxAmount?: number;
    voucherType: string;
    branchCode: string;
  }): Promise<DuplicateCheckResult> {
    await dbConnect();
    const query: Record<string, unknown> = {
      voucherType,
      branchCode: branchCode.toUpperCase(),
      status: { $nin: ["void", "cancelled", "rejected"] },
    };

    if (invoiceNumber) {
      query.reference = invoiceNumber;
    }

    const candidates = await Voucher.find(query)
      .sort({ date: -1 })
      .limit(20)
      .lean();

    const matchedFields: string[] = [];
    let bestMatch: (typeof candidates)[0] | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      let score = 0;
      const fields: string[] = [];

      if (invoiceNumber && candidate.reference === invoiceNumber) {
        score += 40;
        fields.push("invoiceNumber");
      }

      if (partyName && candidate.partyName && candidate.partyName.toLowerCase() === partyName.toLowerCase()) {
        score += 30;
        fields.push("partyName");
      }

      if (invoiceDate && candidate.date) {
        const cDate = new Date(candidate.date).toISOString().split("T")[0];
        if (cDate === invoiceDate) {
          score += 20;
          fields.push("date");
        }
      }

      if (amount && candidate.grandTotal && Math.abs(candidate.grandTotal - amount) < 0.01) {
        score += 10;
        fields.push("amount");
      }

      if (taxAmount !== undefined && candidate.taxAmount !== undefined && Math.abs(candidate.taxAmount - taxAmount) < 0.01) {
        score += 5;
        fields.push("taxAmount");
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }

      if (score >= 70) break;
    }

    const isDuplicate = bestScore >= 70;

    return {
      isDuplicate,
      existingVoucherId: bestMatch ? String(bestMatch._id) : undefined,
      existingVoucherNumber: bestMatch?.number,
      matchScore: bestScore,
      matchedFields: isDuplicate ? matchedFields : [],
    };
  },
};
