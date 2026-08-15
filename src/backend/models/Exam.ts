import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IExamResult {
  studentId: Types.ObjectId;
  marks: number;
  grade?: string;
  remarks?: string;
}

export interface IExam {
  title: string;
  examType: "quiz" | "midterm" | "final" | "assignment";
  classId: Types.ObjectId;
  subjectId: Types.ObjectId;
  teacherId?: Types.ObjectId;
  date: Date;
  maxMarks: number;
  results: IExamResult[];
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<IExam>(
  {
    title: { type: String, required: true, trim: true },
    examType: {
      type: String,
      enum: ["quiz", "midterm", "final", "assignment"],
      required: true,
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    date: { type: Date, required: true },
    maxMarks: { type: Number, required: true },
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
