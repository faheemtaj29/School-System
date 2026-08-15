import mongoose, { Schema, models, model } from "mongoose";

export interface ISubject {
  name: string;
  code: string;
  description?: string;
  /** Weekly periods at school level, credit hours at college / university. */
  credits: number;
  stage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    credits: { type: Number, default: 1 },
    stage: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Subject = models.Subject || model<ISubject>("Subject", SubjectSchema);
