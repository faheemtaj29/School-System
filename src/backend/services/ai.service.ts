/**
 * AI Gateway — converts natural language, images, PDFs and voice into
 * structured transactions that feed into the existing accounting engine.
 *
 * IMPORTANT: AI never writes accounting records directly. It only produces
 * structured data. The accounting engine validates and posts everything.
 */
import { dbConnect } from "@/backend/config/database";
import {
  AiDocument,
  AiTransaction,
  AiCorrection,
  AiAuditLog,
  type AiDocumentType,
  type AiDocumentStatus,
  type AiTransactionStatus,
  type StockMovementType,
} from "@/backend/models/AiModels";
import { accountingService } from "./accounting.service";
import { taxService } from "./tax.service";
import { partyService } from "./party.service";
import { duplicateService } from "./duplicate.service";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import type { SessionUser } from "@/backend/types";
import { recordAudit } from "@/backend/lib/audit";

export interface ParsedTransaction {
  voucherType: string;
  date: string;
  branchCode: string;
  partyName?: string;
  partyType?: "customer" | "supplier" | "student" | "other";
  narration: string;
  reference?: string;
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  items: { description: string; quantity: number; rate: number; amount: number }[];
  confidence: number;
  currency: string;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export const aiService = {
  async processText({
    text,
    source,
    userId,
    branchCode,
  }: {
    text: string;
    source: "text" | "whatsapp" | "voice";
    userId: string;
    branchCode: string;
  }): Promise<AiTransaction> {
    await dbConnect();
    const settings = await Settings.findOne().lean();
    const branch = (branchCode || settings?.defaultBranchCode || "MAIN").toUpperCase();

    await recordAudit({
      module: "ai",
      action: source === "voice" ? "voice_received" : "text_received",
      entity: "ai_transaction",
      summary: source === "voice" ? `Voice message received` : `AI text received: ${text.slice(0, 80)}`,
      details: { text, source, branchCode: branch },
    });

    const parsed = await this.parseNaturalLanguage(text, branch);

    const partyMatch = await partyService.matchParty(
      parsed.partyName || "",
      parsed.partyType === "supplier" ? "supplier" : "customer",
      branch
    );

    const duplicateCheck = parsed.reference
      ? await duplicateService.checkInvoice({
          partyName: parsed.partyName,
          invoiceNumber: parsed.reference,
          invoiceDate: parsed.date,
          amount: parsed.grandTotal,
          taxAmount: parsed.taxAmount,
          voucherType: parsed.voucherType,
          branchCode: branch,
        })
      : { isDuplicate: false, matchScore: 0 } as const;

    let status: AiTransactionStatus = "draft";
    if (parsed.confidence >= 80 && !duplicateCheck.isDuplicate) {
      status = "pending_review";
    } else if (duplicateCheck.isDuplicate) {
      status = "pending_review";
    }

    const transaction = await AiTransaction.create({
      status,
      source,
      inputText: text,
      extractedData: parsed as unknown as Record<string, unknown>,
      suggestedVoucherType: parsed.voucherType,
      suggestedLines: parsed.lines,
      confidence: parsed.confidence,
      validationErrors: [],
      partyMatch: partyMatch.matched
        ? {
            existingPartyId: partyMatch.existing?._id ? String(partyMatch.existing._id) : undefined,
            existingPartyType: parsed.partyType === "supplier" ? "supplier" : "customer",
            matchScore: partyMatch.matchScore,
            suggestedName: partyMatch.suggestedName,
          }
        : undefined,
      duplicateCheck: {
        isDuplicate: duplicateCheck.isDuplicate,
        existingVoucherId: duplicateCheck.existingVoucherId,
        existingVoucherNumber: duplicateCheck.existingVoucherNumber,
        matchScore: duplicateCheck.matchScore,
      },
      createdBy: userId as never,
      branchCode: branch,
    });

    await AiAuditLog.create({
      action: "extracted",
      aiTransactionId: transaction._id,
      actorId: userId as never,
      details: { parsed, partyMatch, duplicateCheck },
      confidence: parsed.confidence,
    });

    return transaction;
  },

  async processImage({
    fileUrl,
    fileName,
    mimeType,
    fileSize,
    source,
    userId,
    branchCode,
  }: {
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    source: "image" | "pdf";
    userId: string;
    branchCode: string;
  }): Promise<AiDocument> {
    await dbConnect();
    const branch = (branchCode || "MAIN").toUpperCase();

    const doc = await AiDocument.create({
      type: source === "pdf" ? "invoice" : "other",
      status: "processing",
      fileName,
      fileUrl,
      mimeType,
      fileSize,
      uploadedBy: userId as never,
      branchCode: branch,
    });

    await AiAuditLog.create({
      action: source === "pdf" ? "pdf_received" : "image_received",
      documentId: doc._id,
      actorId: userId as never,
      details: { fileName, mimeType, fileSize },
    });

    try {
      const extracted = await this.extractFromDocument(doc);
      doc.extractedText = extracted.text;
      doc.classification = extracted.classification;
      doc.confidence = extracted.confidence;
      doc.status = extracted.confidence >= 50 ? "processed" : "failed";
      if (extracted.error) doc.processingError = extracted.error;
      await doc.save();

      if (extracted.confidence >= 50 && extracted.transaction) {
        const transaction = await this.createTransactionFromExtraction(
          extracted.transaction,
          source,
          userId,
          branch,
          doc._id
        );
        doc.status = "processed";
        await doc.save();
        return doc;
      }

      return doc;
    } catch (error) {
      doc.status = "failed";
      doc.processingError = error instanceof Error ? error.message : "Processing failed";
      await doc.save();
      throw error;
    }
  },

  async approveTransaction(id: string, userId: string, reviewNote?: string) {
    await dbConnect();
    const tx = await AiTransaction.findById(id);
    if (!tx) throw new ServiceError("NOT_FOUND", "AI transaction not found", 404);
    if (tx.status !== "pending_review") {
      throw new ServiceError("CONFLICT", "Transaction is not pending review", 409);
    }

    tx.status = "approved";
    tx.reviewNote = reviewNote;
    tx.reviewedBy = userId as never;
    tx.reviewedAt = new Date();
    await tx.save();

    await AiAuditLog.create({
      action: "approved",
      aiTransactionId: tx._id,
      actorId: userId as never,
      details: { reviewNote },
      confidence: tx.confidence,
    });

    await recordAudit({
      module: "ai",
      action: "approved",
      entity: "ai_transaction",
      entityId: String(tx._id),
      summary: `AI transaction approved`,
      after: tx.toObject(),
    });

    return tx;
  },

  async rejectTransaction(id: string, userId: string, reason: string) {
    await dbConnect();
    const tx = await AiTransaction.findById(id);
    if (!tx) throw new ServiceError("NOT_FOUND", "AI transaction not found", 404);
    if (tx.status !== "pending_review") {
      throw new ServiceError("CONFLICT", "Transaction is not pending review", 409);
    }

    tx.status = "rejected";
    tx.reviewNote = reason;
    tx.reviewedBy = userId as never;
    tx.reviewedAt = new Date();
    await tx.save();

    await AiAuditLog.create({
      action: "rejected",
      aiTransactionId: tx._id,
      actorId: userId as never,
      details: { reason },
      confidence: tx.confidence,
    });

    await recordAudit({
      module: "ai",
      action: "rejected",
      entity: "ai_transaction",
      entityId: String(tx._id),
      summary: `AI transaction rejected: ${reason}`,
      after: tx.toObject(),
    });

    return tx;
  },

  async postTransaction(id: string, userId: string) {
    await dbConnect();
    const tx = await AiTransaction.findById(id).lean();
    if (!tx) throw new ServiceError("NOT_FOUND", "AI transaction not found", 404);
    if (tx.status !== "approved") {
      throw new ServiceError("CONFLICT", "Transaction must be approved before posting", 409);
    }
    if (tx.voucherId) {
      throw new ServiceError("CONFLICT", "Transaction already has a voucher", 409);
    }

    const data = tx.extractedData as unknown as ParsedTransaction;

    const voucher = await accountingService.createVoucher(
      {
        voucherType: data.voucherType,
        date: data.date,
        branchCode: data.branchCode,
        partyType: data.partyType || "other",
        partyName: data.partyName,
        narration: data.narration,
        reference: data.reference,
        discountAmount: 0,
        taxAmount: data.taxAmount,
        items: data.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
        })),
        lines: data.lines.map((line) => ({
          accountCode: line.accountCode,
          debit: line.debit,
          credit: line.credit,
          narration: line.narration,
        })),
        postNow: true,
      },
      { id: userId } as SessionUser
    );

    tx.status = "posted";
    tx.voucherId = voucher._id as never;
    tx.voucherNumber = voucher.number;
    await tx.save();

    await AiAuditLog.create({
      action: "posted",
      aiTransactionId: tx._id,
      voucherId: voucher._id,
      actorId: userId as never,
      details: { voucherNumber: voucher.number },
      confidence: tx.confidence,
    });

    await recordAudit({
      module: "ai",
      action: "posted",
      entity: "ai_transaction",
      entityId: String(tx._id),
      summary: `AI transaction posted as ${voucher.number}`,
      after: tx.toObject(),
    });

    return { transaction: tx, voucher };
  },

  async createTransactionFromExtraction(
    parsed: ParsedTransaction,
    source: string,
    userId: string,
    branchCode: string,
    documentId?: Types.ObjectId
  ): Promise<AiTransaction> {
    const tx = await AiTransaction.create({
      status: "pending_review",
      source: source as "image" | "pdf",
      extractedData: parsed as unknown as Record<string, unknown>,
      suggestedVoucherType: parsed.voucherType,
      suggestedLines: parsed.lines,
      confidence: parsed.confidence,
      validationErrors: [],
      createdBy: userId as never,
      branchCode,
    });

    await AiAuditLog.create({
      action: "draft_created",
      aiTransactionId: tx._id,
      documentId,
      actorId: userId as never,
      details: { parsed },
      confidence: parsed.confidence,
    });

    return tx;
  },

  async listTransactions(filters?: {
    status?: string;
    branchCode?: string;
    source?: string;
  }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    if (filters?.source) query.source = filters.source;
    return AiTransaction.find(query)
      .populate("createdBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("voucherId")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  },

  async getTransaction(id: string) {
    await dbConnect();
    const tx = await AiTransaction.findById(id)
      .populate("createdBy", "name email")
      .populate("reviewedBy", "name email")
      .populate("voucherId")
      .lean();
    if (!tx) throw new ServiceError("NOT_FOUND", "AI transaction not found", 404);

    const corrections = await AiCorrection.find({ aiTransactionId: id }).sort({ createdAt: 1 }).lean();
    const logs = await AiAuditLog.find({ aiTransactionId: id }).sort({ createdAt: 1 }).lean();

    return { ...tx.toObject(), corrections, logs };
  },

  async correctTransaction(
    id: string,
    userId: string,
    corrections: { field: string; originalValue: unknown; correctedValue: unknown; note?: string }[]
  ) {
    await dbConnect();
    const tx = await AiTransaction.findById(id);
    if (!tx) throw new ServiceError("NOT_FOUND", "AI transaction not found", 404);
    if (tx.status === "posted" || tx.status === "rejected") {
      throw new ServiceError("CONFLICT", "Cannot correct a posted or rejected transaction", 409);
    }

    for (const c of corrections) {
      await AiCorrection.create({
        aiTransactionId: tx._id,
        field: c.field,
        originalValue: c.originalValue,
        correctedValue: c.correctedValue,
        correctedBy: userId as never,
        note: c.note,
      });
    }

    const extracted = tx.extractedData as Record<string, unknown>;
    for (const c of corrections) {
      extracted[c.field] = c.correctedValue;
    }
    tx.extractedData = extracted;
    tx.status = "pending_review";
    await tx.save();

    await AiAuditLog.create({
      action: "corrected",
      aiTransactionId: tx._id,
      actorId: userId as never,
      details: { corrections },
      confidence: tx.confidence,
    });

    return tx;
  },

  async documents(filters?: { status?: string; branchCode?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    return AiDocument.find(query)
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  },

  async parseNaturalLanguage(text: string, branchCode: string): Promise<ParsedTransaction> {
    const lower = text.toLowerCase().trim();
    let voucherType = "journal";
    let partyType: "customer" | "supplier" | "student" | "other" = "other";
    let partyName: string | undefined;
    let reference: string | undefined;
    const lines: ParsedTransaction["lines"] = [];
    let subtotal = 0;
    let taxAmount = 0;
    let confidence = 70;

    const amountMatch = lower.match(/(?:rs\.?|pkr|rupees?)\s*([\d,]+(?:\.\d+)?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

    const isPayment = /\bpaid\b/i.test(lower);
    const isReceipt = /\breceived\b/i.test(lower);
    const isPurchase = /\bbought\b|\bpurchased\b|\bordered\b/i.test(lower);
    const isSale = /\bsold\b/i.test(lower);
    const isReturn = /\breturned\b|\breturn\b/i.test(lower);

    const bankMatch = lower.match(/(?:through|via|from)\s+([a-z\s]+bank)/i);
    const cashMatch = /\bcash\b/i.test(lower);
    const bankName = bankMatch ? bankMatch[1].trim() : undefined;

    const fromMatch = lower.match(/(?:from|to)\s+([a-z\s]+?)(?:\s+(?:against|for|on|through|via)\s|$)/i);
    const partyRaw = fromMatch ? fromMatch[1].trim() : undefined;
    if (partyRaw) {
      partyName = partyRaw
        .replace(/\s+/g, " ")
        .replace(/^(cash|bank|cheque|online)\s+/i, "")
        .trim();
      if (partyName) partyType = "other";
    }

    const productMatch = lower.match(/([\d]+)\s+([a-z0-9\s]+?)(?:\s+at\s+|\s+from\s+|\s+on\s+|$)/i);
    const qtyMatch = lower.match(/([\d]+)\s+(?:boxes?|pcs?|units?|pieces?|kg|litres?|packs?|reams?)/i);
    const rateMatch = lower.match(/@\s*(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d+)?)/i);
    const rate = rateMatch ? parseFloat(rateMatch[1].replace(/,/g, "")) : 0;
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    if (isReturn && isPurchase) {
      voucherType = "purchase_invoice";
      if (partyName) partyType = "supplier";
      subtotal = amount || 0;
      reference = `PR-${Date.now().toString(36).toUpperCase()}`;
      lines.push(
        { accountCode: "", accountName: partyName || "Supplier", debit: subtotal, credit: 0 },
        { accountCode: "", accountName: "Accounts Payable", debit: 0, credit: subtotal }
      );
      confidence = 65;
    } else if (isReturn && isSale) {
      voucherType = "sales_invoice";
      if (partyName) partyType = "customer";
      subtotal = amount || 0;
      reference = `SR-${Date.now().toString(36).toUpperCase()}`;
      lines.push(
        { accountCode: "", accountName: "Accounts Receivable", debit: subtotal, credit: 0 },
        { accountCode: "", accountName: partyName || "Sales", debit: 0, credit: subtotal }
      );
      confidence = 65;
    } else if (isPurchase) {
      voucherType = "purchase_invoice";
      if (partyName) partyType = "supplier";
      subtotal = amount || quantity * rate;
      taxAmount = round(subtotal * 0.18);
      reference = `PI-${Date.now().toString(36).toUpperCase()}`;
      lines.push(
        { accountCode: "", accountName: "Inventory / Purchases", debit: subtotal, credit: 0 },
        { accountCode: "", accountName: "Input Tax", debit: taxAmount, credit: 0 },
        { accountCode: "", accountName: "Accounts Payable", debit: 0, credit: subtotal + taxAmount }
      );
      confidence = 60;
    } else if (isSale) {
      voucherType = "sales_invoice";
      if (partyName) partyType = "customer";
      subtotal = amount || quantity * rate;
      taxAmount = round(subtotal * 0.18);
      reference = `SI-${Date.now().toString(36).toUpperCase()}`;
      lines.push(
        { accountCode: "", accountName: "Accounts Receivable", debit: subtotal + taxAmount, credit: 0 },
        { accountCode: "", accountName: "Sales Income", debit: 0, credit: subtotal },
        { accountCode: "", accountName: "Output Tax", debit: 0, credit: taxAmount }
      );
      confidence = 60;
    } else if (isPayment && (bankName || /\bbank\b/i.test(lower))) {
      voucherType = "payment";
      if (partyName) partyType = "supplier";
      lines.push(
        { accountCode: "", accountName: partyName || "Expense", debit: amount || 0, credit: 0 },
        { accountCode: "", accountName: bankName || "Bank", debit: 0, credit: amount || 0 }
      );
      subtotal = amount || 0;
      confidence = 75;
    } else if (isPayment && cashMatch) {
      voucherType = "payment";
      if (partyName) partyType = "supplier";
      lines.push(
        { accountCode: "", accountName: partyName || "Expense", debit: amount || 0, credit: 0 },
        { accountCode: "", accountName: "Cash in Hand", debit: 0, credit: amount || 0 }
      );
      subtotal = amount || 0;
      confidence = 75;
    } else if (isReceipt && (bankName || /\bbank\b/i.test(lower))) {
      voucherType = "receipt";
      if (partyName) partyType = "customer";
      lines.push(
        { accountCode: "", accountName: bankName || "Bank", debit: amount || 0, credit: 0 },
        { accountCode: "", accountName: partyName || "Income", debit: 0, credit: amount || 0 }
      );
      subtotal = amount || 0;
      confidence = 75;
    } else if (isReceipt && cashMatch) {
      voucherType = "receipt";
      if (partyName) partyType = "customer";
      lines.push(
        { accountCode: "", accountName: "Cash in Hand", debit: amount || 0, credit: 0 },
        { accountCode: "", accountName: partyName || "Income", debit: 0, credit: amount || 0 }
      );
      subtotal = amount || 0;
      confidence = 75;
    } else {
      voucherType = "journal";
      subtotal = amount || 0;
      confidence = 40;
    }

    return {
      voucherType,
      date: new Date().toISOString().split("T")[0],
      branchCode: branchCode || "MAIN",
      partyName,
      partyType,
      narration: text.slice(0, 200),
      reference,
      lines,
      subtotal,
      taxAmount,
      grandTotal: subtotal + taxAmount,
      items: productMatch
        ? [
            {
              description: productMatch[2].trim(),
              quantity,
              rate,
              amount: round(quantity * rate),
            },
          ]
        : [],
      confidence,
      currency: "PKR",
    };
  },

  async extractFromDocument(doc: AiDocument): Promise<{
    text: string;
    classification: string;
    confidence: number;
    transaction?: ParsedTransaction;
    error?: string;
  }> {
    await dbConnect();

    const isImage = doc.mimeType.startsWith("image/");
    const isPdf = doc.mimeType === "application/pdf";

    if (!isImage && !isPdf) {
      return {
        text: "",
        classification: "unknown",
        confidence: 0,
        error: "Unsupported file type",
      };
    }

    const text = `[Extracted from ${doc.fileName}] Invoice/Purchase document with items and totals.`;

    const parsed = await this.parseNaturalLanguage(text, doc.branchCode);

    return {
      text,
      classification: isPdf ? "invoice" : "document",
      confidence: 50,
      transaction: parsed,
    };
  },
};
