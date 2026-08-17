import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IExamResult {
  studentId: Types.ObjectId;
  marks: number;
  grade?: string;
  remarks?: string;
}

export interface IExam {
  title: string;
  examType: string;
  classId: Types.ObjectId;
  subjectId: Types.ObjectId;
  teacherId?: Types.ObjectId;
  date: Date;
  endDate?: Date;
  examTime?: string;
  endTime?: string;
  room?: string;
  maxMarks: number;
  results: IExamResult[];
  marksStatus: "draft" | "submitted" | "verified" | "approved" | "locked" | "published";
  submittedAt?: Date;
  submittedBy?: Types.ObjectId;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  lockedAt?: Date;
  lockedBy?: Types.ObjectId;
  publishedAt?: Date;
  publishedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<IExam>(
  {
    title: { type: String, required: true, trim: true },
    examType: {
      type: String,
      trim: true,
      required: true,
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    date: { type: Date, required: true },
    endDate: Date,
    examTime: String,
    endTime: String,
    room: { type: String, trim: true },
    maxMarks: { type: Number, required: true },
    marksStatus: {
      type: String,
      enum: ["draft", "submitted", "verified", "approved", "locked", "published"],
      default: "draft",
    },
    submittedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lockedAt: Date,
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: Date,
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
    results: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
        marks: { type: Number, required: true },
        grade: String,
        remarks: String,
      },
    ],
  },
  { timestamps: true }
);

export const Exam = models.Exam || model<IExam>("Exam", ExamSchema);
