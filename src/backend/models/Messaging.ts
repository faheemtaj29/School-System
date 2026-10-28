/**
 * Messages sent (or handed to WhatsApp) to parents: absences, fee reminders, results, notices.
 */
import { Schema, models, model, Types } from "mongoose";

export type MessageKind = "absence" | "fee" | "result" | "datesheet" | "custom";

export interface IMessageLog {
  kind: MessageKind;
  studentId?: Types.ObjectId;
  to: string;
  recipientName?: string;
  text: string;
  /** sms / whatsapp through the gateway, or "manual" when opened in WhatsApp by hand. */
  channel: "sms" | "whatsapp" | "manual";
  status: "sent" | "failed" | "opened";
  error?: string;
  sentBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MessageLogSchema = new Schema<IMessageLog>(
  {
    kind: { type: String, enum: ["absence", "fee", "result", "datesheet", "custom"], required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student" },
    to: { type: String, required: true },
    recipientName: String,
    text: { type: String, required: true },
    channel: { type: String, enum: ["sms", "whatsapp", "manual"], required: true },
    status: { type: String, enum: ["sent", "failed", "opened"], required: true },
    error: String,
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

MessageLogSchema.index({ createdAt: -1 });
MessageLogSchema.index({ studentId: 1, kind: 1, createdAt: -1 });

export const MessageLog = models.MessageLog || model<IMessageLog>("MessageLog", MessageLogSchema);
