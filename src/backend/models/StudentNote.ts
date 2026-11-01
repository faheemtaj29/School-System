/**
 * Dated notes on a student by teachers and the office: academic progress, behaviour,
 * achievements, health and parent meetings. A note can be shared with the parent portal.
 */
import { Schema, models, model, Types } from "mongoose";

export const NOTE_KINDS = ["academic", "behaviour", "achievement", "health", "meeting", "other"] as const;

export interface IStudentNote {
  studentId: Types.ObjectId;
  kind: (typeof NOTE_KINDS)[number];
  text: string;
  date: Date;
  /** Shown to the student / parent in their portal. */
  shared: boolean;
  createdBy?: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentNoteSchema = new Schema<IStudentNote>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    kind: { type: String, enum: NOTE_KINDS, default: "other" },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    date: { type: Date, default: Date.now },
    shared: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
  },
  { timestamps: true }
);

export const StudentNote = models.StudentNote || model<IStudentNote>("StudentNote", StudentNoteSchema);
