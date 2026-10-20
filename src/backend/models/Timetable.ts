import { Schema, model, models, Types } from "mongoose";

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface ITimetableSlot {
  day: Weekday;
  period: number;        // 1-based
  startTime?: string;    // "08:00"
  endTime?: string;      // "08:45"
  subject?: Types.ObjectId;
  teacher?: Types.ObjectId;
  room?: string;
  label?: string;        // e.g. "Break", "Assembly" for non-subject slots
  isBreak?: boolean;
}

export interface ITimetable {
  classId: Types.ObjectId;
  academicYear: string;
  branchCode?: string;
  days: Weekday[];
  periodsPerDay: number;
  slots: ITimetableSlot[];
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const slotSchema = new Schema<ITimetableSlot>({
  day: { type: String, required: true, enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  period: { type: Number, required: true, min: 1 },
  startTime: String,
  endTime: String,
  subject: { type: Schema.Types.ObjectId, ref: "Subject" },
  teacher: { type: Schema.Types.ObjectId, ref: "Teacher" },
  room: String,
  label: String,
  isBreak: Boolean,
}, { _id: true });

const timetableSchema = new Schema<ITimetable>({
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  academicYear: { type: String, required: true },
  branchCode: { type: String, uppercase: true },
  days: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  periodsPerDay: { type: Number, default: 8, min: 1, max: 16 },
  slots: { type: [slotSchema], default: [] },
  publishedAt: Date,
}, { timestamps: true });

timetableSchema.index({ classId: 1, academicYear: 1 }, { unique: true });
timetableSchema.index({ "slots.teacher": 1, academicYear: 1 });

export const Timetable = models.Timetable || model<ITimetable>("Timetable", timetableSchema);
