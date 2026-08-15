/**
 * Non-teaching staff CRUD.
 */
import { dbConnect } from "@/backend/config/database";
import { Staff } from "@/backend/models/Staff";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { StaffInput } from "@/backend/validators/auth.validator";

export const staffService = {
  async list(branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    return Staff.find(filter).sort({ firstName: 1, lastName: 1 }).lean();
  },

  async create(data: StaffInput) {
    await dbConnect();
    return Staff.create({
      ...data,
      email: data.email.toLowerCase(),
      joinDate: parseOptionalDate(data.joinDate),
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    });
  },

  async update(id: string, data: StaffInput) {
    await dbConnect();
    const item = await Staff.findByIdAndUpdate(
      id,
      {
        ...data,
        email: data.email.toLowerCase(),
        joinDate: parseOptionalDate(data.joinDate),
        branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
      },
      { new: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Staff member not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Staff.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Staff member not found", 404);
    return { ok: true };
  },
};
