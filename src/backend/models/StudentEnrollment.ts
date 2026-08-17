import { Schema, model, models, Types } from "mongoose";

export type EnrollmentStatus = "active" | "promoted" | "completed" | "withdrawn" | "hold";
export type EnrollmentContextType = "class" | "program_semester" | "research_stage";
export type ProgressionAction =
  | "admission"
  | "promotion"
  | "semester_promotion"
  | "repeat"
  | "probation"
  | "hold"
  | "withdraw"
  | "transfer"
  | "completion"
  | "research_transition";

export interface IStudentEnrollment {
  studentId: Types.ObjectId;
  contextType: EnrollmentContextType;
  progressionAction?: ProgressionAction;
  classId?: Types.ObjectId;
  academicYear: string;
  className?: string;
  section?: string;
  institutionCode?: string;
  campusCode?: string;
  facultyName?: string;
  departmentName?: string;
  programName?: string;
  programCode?: string;
  semesterNumber?: number;
  termName?: string;
  batchName?: string;
  researchStage?: string;
  level?: number;
  stream?: string;
  stage?: string;
  status: EnrollmentStatus;
  startDate?: Date;
  endDate?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentEnrollmentSchema = new Schema<IStudentEnrollment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    contextType: {
      type: String,
      enum: ["class", "program_semester", "research_stage"],
      default: "class",
    },
    progressionAction: {
      type: String,
      enum: [
        "admission",
        "promotion",
        "semester_promotion",
        "repeat",
        "probation",
        "hold",
        "withdraw",
        "transfer",
        "completion",
        "research_transition",
      ],
      default: "admission",
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class" },
    academicYear: { type: String, required: true, trim: true },
    className: { type: String, trim: true },
    section: { type: String, trim: true },
    institutionCode: { type: String, uppercase: true, trim: true },
    campusCode: { type: String, uppercase: true, trim: true },
    facultyName: String,
    departmentName: String,
    programName: String,
    programCode: { type: String, uppercase: true, trim: true },
    semesterNumber: Number,
    termName: String,
    batchName: String,
    researchStage: String,
    level: Number,
    stream: String,
    stage: String,
    status: {
      type: String,
      enum: ["active", "promoted", "completed", "withdrawn", "hold"],
      default: "active",
    },
    startDate: Date,
    endDate: Date,
    note: String,
  },
  { timestamps: true }
);

StudentEnrollmentSchema.index({ studentId: 1, createdAt: -1 });
StudentEnrollmentSchema.index({ classId: 1, academicYear: 1 });
StudentEnrollmentSchema.index({ studentId: 1, contextType: 1, academicYear: 1 });
StudentEnrollmentSchema.index({ programCode: 1, semesterNumber: 1, academicYear: 1 });

export const StudentEnrollment =
  models.StudentEnrollment || model<IStudentEnrollment>("StudentEnrollment", StudentEnrollmentSchema);
