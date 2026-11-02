import { Schema } from "mongoose";

export interface ISetupRevision {
  at: Date;
  byName?: string;
  summary: string;
  snapshot: Record<string, unknown>;
}

export const SetupRevisionSchema = new Schema<ISetupRevision>(
  {
    at: { type: Date, required: true, default: Date.now },
    byName: String,
    summary: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);
