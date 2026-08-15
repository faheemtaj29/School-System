import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IAttendanceRecord {
  studentId: Types.ObjectId;
  status: "present" | "absent" | "late" | "excused";
  note?: string;
}

export interface IAttendance {
  classId: Types.ObjectId;
  date: Date;
  records: IAttendanceRecord[];
  takenBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    date: { type: Date, required: true },
    records: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
        status: {
          type: String,
          enum: ["present", "absent", "late", "excused"],
          required: true,
        },
        note: String,
      },
    ],
    takenBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

AttendanceSchema.index({ classId: 1, date: 1 }, { unique: true });

export const Attendance =
  models.Attendance || model<IAttendance>("Attendance", AttendanceSchema);
