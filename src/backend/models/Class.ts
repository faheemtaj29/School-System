import mongoose, { Schema, models, model, Types } from "mongoose";

export type AcademicStage =
  | "pre-primary"
  | "primary"
  | "middle"
  | "secondary"
  | "intermediate"
  | "undergraduate"
  | "postgraduate";

export interface IClass {
  name: string;
  section: string;
  academicYear: string;
  room?: string;
  classTeacher?: Types.ObjectId;
  capacity: number;
  branchCode?: string;
  stage?: AcademicStage;
  /** Group / programme, e.g. Pre-Medical or BS Computer Science. */
  stream?: string;
  /** Sort order across the whole ladder (pre-nursery = 1). */
  level?: number;
  /** Reusable monthly fee heads and amounts for this class. */
  feeStructure?: { head: string; amount: number }[];
  subjects: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ClassSchema = new Schema<IClass>(
  {
    name: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true },
    room: String,
    classTeacher: { type: Schema.Types.ObjectId, ref: "Teacher" },
    capacity: { type: Number, default: 40 },
    branchCode: { type: String, uppercase: true, trim: true },
    stage: {
      type: String,
      enum: [
        "pre-primary",
        "primary",
        "middle",
        "secondary",
        "intermediate",
        "undergraduate",
        "postgraduate",
      ],
    },
    stream: { type: String, trim: true },
    level: { type: Number, default: 0 },
    feeStructure: {
      type: [{ head: { type: String, required: true, trim: true }, amount: { type: Number, required: true, min: 0 } }],
      default: [],
    },
    subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
  },
  { timestamps: true }
);

ClassSchema.index({ name: 1, section: 1, academicYear: 1 }, { unique: true });

export const ClassModel = models.Class || model<IClass>("Class", ClassSchema);
