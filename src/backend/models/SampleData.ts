import { Schema, models, model, Types } from "mongoose";

/**
 * Records made by "Load sample data", so "Remove sample data" deletes exactly these
 * (and everything linked to them) and nothing the school entered itself.
 */
export interface ISampleData {
  key: string;
  studentIds: Types.ObjectId[];
  teacherIds: Types.ObjectId[];
  termId?: Types.ObjectId;
  classIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const SampleDataSchema = new Schema<ISampleData>(
  {
    key: { type: String, default: "sample", unique: true },
    studentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    teacherIds: [{ type: Schema.Types.ObjectId, ref: "Teacher" }],
    termId: { type: Schema.Types.ObjectId, ref: "ExamTerm" },
    classIds: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  },
  { timestamps: true }
);

export const SampleData = models.SampleData || model<ISampleData>("SampleData", SampleDataSchema);
