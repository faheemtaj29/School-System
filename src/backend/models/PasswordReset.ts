import { Schema, models, model, Types } from "mongoose";

/**
 * A one-time password reset link. Only a hash of the token is stored, so a copy of the
 * database cannot be used to reset anyone's password. Links expire after an hour.
 */
export interface IPasswordReset {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  /** The admin who sent it, or empty when the user asked for it themselves. */
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Old links clean themselves up a day after they expire.
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const PasswordReset = models.PasswordReset || model<IPasswordReset>("PasswordReset", PasswordResetSchema);
