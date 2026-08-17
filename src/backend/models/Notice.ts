import { Schema, models, model, Types } from "mongoose";

export interface INotice {
  title: string;
  body: string;
  audience: "all" | "staff" | "students" | "parents" | "class";
  classId?: Types.ObjectId;
  branchCode?: string;
  priority: "normal" | "high" | "urgent";
  publishDate: Date;
  expiryDate?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NoticeSchema = new Schema<INotice>(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    audience: {
      type: String,
      enum: ["all", "staff", "students", "parents", "class"],
      default: "all",
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class" },
    branchCode: { type: String, uppercase: true, trim: true },
    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      default: "normal",
    },
    publishDate: { type: Date, default: Date.now },
    expiryDate: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Notice = models.Notice || model<INotice>("Notice", NoticeSchema);
