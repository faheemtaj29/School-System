/**
 * Distance learning — courses, live/recorded lectures, enrollments, diplomas.
 * One file, four collections (lean).
 */
import { Schema, models, model, Types } from "mongoose";

export interface ICourse {
  code: string;
  title: string;
  description?: string;
  mode: "online" | "hybrid" | "distance";
  level: "certificate" | "diploma" | "short" | "degree";
  teacherId?: Types.ObjectId;
  durationWeeks: number;
  fee: number;
  maxSeats: number;
  startDate?: Date;
  endDate?: Date;
  status: "draft" | "open" | "ongoing" | "closed";
  liveLink?: string;
  thumbnail?: string;
  branchCode?: string;
  /** Weekly course outline — lectures, labs, projects, assessments. */
  outline?: {
    week: number;
    title: string;
    type: "lecture" | "lab" | "project" | "assessment";
    description?: string;
    deliverable?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: String,
    mode: { type: String, enum: ["online", "hybrid", "distance"], default: "online" },
    level: {
      type: String,
      enum: ["certificate", "diploma", "short", "degree"],
      default: "certificate",
    },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    durationWeeks: { type: Number, default: 8 },
    fee: { type: Number, default: 0 },
    maxSeats: { type: Number, default: 40 },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["draft", "open", "ongoing", "closed"],
      default: "open",
    },
    liveLink: String,
    thumbnail: String,
    branchCode: { type: String, uppercase: true, trim: true },
    outline: [
      {
        week: { type: Number, required: true },
        title: { type: String, required: true },
        type: {
          type: String,
          enum: ["lecture", "lab", "project", "assessment"],
          default: "lecture",
        },
        description: String,
        deliverable: String,
      },
    ],
  },
  { timestamps: true }
);

export const Course = models.Course || model<ICourse>("Course", CourseSchema);

export interface ILecture {
  courseId: Types.ObjectId;
  title: string;
  type: "live" | "recorded";
  teacherId?: Types.ObjectId;
  scheduledAt?: Date;
  durationMin: number;
  /** Zoom/Meet/etc. for live */
  meetingUrl?: string;
  /** Video URL / YouTube / Vimeo / file path for recorded */
  recordingUrl?: string;
  notes?: string;
  status: "scheduled" | "live" | "completed" | "cancelled";
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LectureSchema = new Schema<ILecture>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["live", "recorded"], required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    scheduledAt: Date,
    durationMin: { type: Number, default: 45 },
    meetingUrl: String,
    recordingUrl: String,
    notes: String,
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
    },
    order: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const Lecture = models.Lecture || model<ILecture>("Lecture", LectureSchema);

export interface IEnrollment {
  courseId: Types.ObjectId;
  studentId: Types.ObjectId;
  enrolledAt: Date;
  status: "pending" | "active" | "completed" | "dropped";
  progress: number;
  completedLectureIds: Types.ObjectId[];
  feePaid: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    enrolledAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "dropped"],
      default: "active",
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedLectureIds: [{ type: Schema.Types.ObjectId, ref: "Lecture" }],
    feePaid: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

EnrollmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true });

export const Enrollment =
  models.Enrollment || model<IEnrollment>("Enrollment", EnrollmentSchema);

export interface IDiploma {
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  title: string;
  diplomaNo: string;
  issueDate: Date;
  grade?: string;
  status: "issued" | "revoked";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiplomaSchema = new Schema<IDiploma>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true },
    diplomaNo: { type: String, required: true, unique: true, trim: true },
    issueDate: { type: Date, default: Date.now },
    grade: String,
    status: { type: String, enum: ["issued", "revoked"], default: "issued" },
    notes: String,
  },
  { timestamps: true }
);

export const Diploma = models.Diploma || model<IDiploma>("Diploma", DiplomaSchema);

export interface IQuizQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface IQuiz {
  courseId: Types.ObjectId;
  title: string;
  passPercent: number;
  questions: IQuizQuestion[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuizSchema = new Schema<IQuiz>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true },
    passPercent: { type: Number, default: 50, min: 1, max: 100 },
    questions: [
      {
        prompt: { type: String, required: true },
        options: { type: [String], default: [] },
        correctIndex: { type: Number, default: 0 },
      },
    ],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Quiz = models.Quiz || model<IQuiz>("Quiz", QuizSchema);

export interface IQuizAttempt {
  quizId: Types.ObjectId;
  studentId: Types.ObjectId;
  answers: number[];
  score: number;
  percent: number;
  passed: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    answers: { type: [Number], default: [] },
    score: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

QuizAttemptSchema.index({ quizId: 1, studentId: 1 });

export const QuizAttempt =
  models.QuizAttempt || model<IQuizAttempt>("QuizAttempt", QuizAttemptSchema);
