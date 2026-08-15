/**
 * Fee vouchers linked to students — paid amounts auto-post to Accounting.
 */
import { dbConnect } from "@/backend/config/database";
import { Fee } from "@/backend/models/Fee";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { FeeInput } from "@/backend/validators/fee.validator";
import { accountingService } from "@/backend/services/accounting.service";

const studentPopulate = {
  path: "studentId",
  select: "firstName lastName admissionNo classId branchCode",
  populate: { path: "classId", select: "name section branchCode" },
} as const;

function toPayload(data: FeeInput) {
  return {
    ...data,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dueDate: new Date(data.dueDate),
    paymentDate: parseOptionalDate(data.paymentDate ?? undefined),
  };
}

async function syncFeeLedger(fee: {
  _id: { toString(): string };
  title: string;
  paidAmount: number;
  status: string;
  paymentDate?: Date | null;
  method?: string;
  branchCode?: string;
  studentId: unknown;
}) {
  const paid = fee.paidAmount || 0;
  if (paid <= 0 || fee.status === "pending") {
    await accountingService.removeBySource("fee", String(fee._id));
    return;
  }
  await accountingService.upsertLinked({
    type: "income",
    category: "Student Fees",
    title: fee.title,
    amount: paid,
    date: fee.paymentDate || new Date(),
    method: fee.method as "cash" | "bank" | "online" | undefined,
    reference: `FEE-${String(fee._id).slice(-6).toUpperCase()}`,
    notes: "Auto-posted from fee voucher",
    branchCode: fee.branchCode,
    sourceType: "fee",
    sourceId: String(fee._id),
  });
}

export const feeService = {
  async list(filters: { studentId?: string | null; status?: string | null; branchCode?: string | null }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.status) query.status = filters.status;
    if (filters.branchCode) query.branchCode = filters.branchCode.toUpperCase();

    return Fee.find(query).populate(studentPopulate).sort({ dueDate: -1 }).lean();
  },

  async create(data: FeeInput) {
    await dbConnect();
    const item = await Fee.create(toPayload(data));
    await syncFeeLedger(item);
    return Fee.findById(item._id).populate(studentPopulate).lean();
  },

  async update(id: string, data: FeeInput) {
    await dbConnect();
    const item = await Fee.findByIdAndUpdate(
      id,
      {
        ...toPayload(data),
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      },
      { new: true }
    ).populate(studentPopulate);
    if (!item) throw new ServiceError("NOT_FOUND", "Fee not found", 404);
    await syncFeeLedger(item);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Fee.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Fee not found", 404);
    await accountingService.removeBySource("fee", id);
    return { ok: true };
  },
};
