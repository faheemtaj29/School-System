import { Schema, models, model, Types } from "mongoose";

/** Breakdown of how marks are distributed across components for a subject. */
export interface IMarkComponents {
  theory?: number;
  viva?: number;
  assignment?: number;
  attendance?: number;
  project?: number;
}

export interface IExamResult {
  studentId: Types.ObjectId;
  /** Total obtained marks (sum of components when components are used). */
  marks: number;
  /** Optional per-component obtained marks. */
  components?: IMarkComponents;
  grade?: string;
  remarks?: string;
}

export interface IExam {
  title: string;
  examType: "quiz" | "midterm" | "final" | "assignment";
  classId: Types.ObjectId;
  subjectId: Types.ObjectId;
  teacherId?: Types.ObjectId;
  scheduleId?: Types.ObjectId;
  date: Date;
  maxMarks: number;
  /** Max marks per component (defines which components are used). */
  markComponents?: IMarkComponents;
  results: IExamResult[];
  createdAt: Date;
  updatedAt: Date;
}

const markComponentsSchema = {
  theory: { type: Number, min: 0 },
  viva: { type: Number, min: 0 },
  assignment: { type: Number, min: 0 },
  attendance: { type: Number, min: 0 },
  project: { type: Number, min: 0 },
};

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
    scheduleId: { type: Schema.Types.ObjectId, ref: "ExamSchedule" },
    date: { type: Date, required: true },
    maxMarks: { type: Number, required: true },
    markComponents: { type: markComponentsSchema, default: undefined },
    results: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
        marks: { type: Number, required: true },
        components: { type: markComponentsSchema, default: undefined },
        grade: String,
        remarks: String,
      },
    ],
  },
  { timestamps: true }
);

ExamSchema.index(
  { scheduleId: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { scheduleId: { $type: "objectId" } } }
);

export const Exam = models.Exam || model<IExam>("Exam", ExamSchema);
