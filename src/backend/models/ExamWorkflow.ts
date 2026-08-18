import { Schema, model, models, Types } from "mongoose";

export interface IExamTypeMaster {
  key: string;
  name: string;
  category: "school" | "college" | "university" | "custom";
  isActive: boolean;
  defaultMaxMarks: number;
  defaultPassingMarks: number;
  institutionCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExamTypeMasterSchema = new Schema<IExamTypeMaster>(
  {
    key: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["school", "college", "university", "custom"],
      default: "school",
    },
    isActive: { type: Boolean, default: true },
    defaultMaxMarks: { type: Number, default: 100, min: 1 },
    defaultPassingMarks: { type: Number, default: 40, min: 1 },
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
  },
  { timestamps: true }
);

ExamTypeMasterSchema.index({ institutionCode: 1, key: 1 }, { unique: true });

export const ExamTypeMaster =
  models.ExamTypeMaster || model<IExamTypeMaster>("ExamTypeMaster", ExamTypeMasterSchema);

export interface IExamTerm {
  name: string;
  academicYear: string;
  examTypeId?: Types.ObjectId;
  weightPercent: number;
  status: "draft" | "active" | "closed";
  startDate: Date;
  endDate: Date;
  institutionCode: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExamTermSchema = new Schema<IExamTerm>(
  {
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    examTypeId: { type: Schema.Types.ObjectId, ref: "ExamTypeMaster" },
    weightPercent: { type: Number, default: 100, min: 0, max: 100 },
    status: { type: String, enum: ["draft", "active", "closed"], default: "draft" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    remarks: String,
  },
  { timestamps: true }
);

ExamTermSchema.index({ institutionCode: 1, academicYear: 1, name: 1 }, { unique: true });

export const ExamTerm = models.ExamTerm || model<IExamTerm>("ExamTerm", ExamTermSchema);

export interface IExamScheduleRow {
  subjectId: Types.ObjectId;
  examDate?: Date;
  startTime?: string;
  endTime?: string;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  invigilatorId?: Types.ObjectId;
  instructions?: string;
  status: "draft" | "published";
}

export interface IExamSchedule {
  academicYear: string;
  termId: Types.ObjectId;
  examTypeId?: Types.ObjectId;
  classId: Types.ObjectId;
  status: "draft" | "published";
  publishedAt?: Date;
  rows: IExamScheduleRow[];
  institutionCode: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamScheduleRowSchema = new Schema<IExamScheduleRow>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    examDate: Date,
    startTime: String,
    endTime: String,
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 1 },
    room: String,
    invigilatorId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    instructions: String,
    status: { type: String, enum: ["draft", "published"], default: "draft" },
  },
  { _id: false }
);

const ExamScheduleSchema = new Schema<IExamSchedule>(
  {
    academicYear: { type: String, required: true, trim: true },
    termId: { type: Schema.Types.ObjectId, ref: "ExamTerm", required: true },
    examTypeId: { type: Schema.Types.ObjectId, ref: "ExamTypeMaster" },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: Date,
    rows: { type: [ExamScheduleRowSchema], default: [] },
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ExamScheduleSchema.index({ institutionCode: 1, academicYear: 1, termId: 1, classId: 1 }, { unique: true });

export const ExamSchedule =
  models.ExamSchedule || model<IExamSchedule>("ExamSchedule", ExamScheduleSchema);
