/**
 * Academic year / session lifecycle — draft, active, closed.
 * Only one session may be active; settings.academicYear mirrors it.
 */
import { Schema, models, model, Types } from "mongoose";

export type SessionStatus = "draft" | "active" | "closed";

export interface IAcademicSession {
  name: string;
  code: string;
  startDate?: Date;
  endDate?: Date;
  status: SessionStatus;
  notes?: string;
  closedAt?: Date;
  activatedAt?: Date;
  /** Previous session this one was opened from (class copy). */
  copiedFrom?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicSessionSchema = new Schema<IAcademicSession>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
    },
    notes: String,
    closedAt: Date,
    activatedAt: Date,
    copiedFrom: { type: Schema.Types.ObjectId, ref: "AcademicSession" },
  },
  { timestamps: true }
);

export const AcademicSession =
  models.AcademicSession || model<IAcademicSession>("AcademicSession", AcademicSessionSchema);
