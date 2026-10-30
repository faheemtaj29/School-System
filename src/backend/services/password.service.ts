/**
 * Passwords, the Facebook way: "Forgot password?" sends a one-time reset link (valid one hour)
 * to the phone on record; the school office can send anyone a link from their profile; and a
 * signed-in user can change their own password. Links work once and are stored only as hashes.
 */
import { createHash, randomBytes } from "crypto";
import { dbConnect } from "@/backend/config/database";
import { hashPassword, verifyPassword } from "@/backend/lib/password";
import { PasswordReset } from "@/backend/models/PasswordReset";
import { Settings } from "@/backend/models/Settings";
import { Staff } from "@/backend/models/Staff";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { User } from "@/backend/models/User";
import { messagingService } from "@/backend/services/messaging.service";
import { ServiceError, type SessionUser } from "@/backend/types";

const LINK_MINUTES = 60;
export const MIN_PASSWORD = 8;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A phone number for the login: its own, else the student's / parent's / teacher's / staff record. */
async function phoneFor(user: { _id: unknown; phone?: string; role: string; email: string }) {
  if (user.phone) return user.phone;
  if (user.role === "parent") return (await Student.findOne({ parentUser: user._id }).select("parentPhone").lean())?.parentPhone;
  if (user.role === "student") {
    const s = await Student.findOne({ user: user._id }).select("phone parentPhone").lean();
    return s?.phone || s?.parentPhone;
  }
  if (user.role === "teacher") {
    return (await Teacher.findOne({ $or: [{ user: user._id }, { email: user.email }] }).select("phone").lean())?.phone;
  }
  if (user.role === "staff") return (await Staff.findOne({ $or: [{ user: user._id }, { email: user.email }] }).select("phone").lean())?.phone;
  return undefined;
}

async function issue(userId: unknown, createdBy?: string) {
  // A new link replaces any earlier unused one.
  await PasswordReset.deleteMany({ userId, usedAt: { $exists: false } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000);
  await PasswordReset.create({ userId, tokenHash: hash(token), expiresAt, createdBy: createdBy || undefined });
  return { token, expiresAt };
}

function checkStrength(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new ServiceError("VALIDATION", `Use at least ${MIN_PASSWORD} characters`, 400);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ServiceError("VALIDATION", "Use both letters and numbers", 400);
  }
}

export const passwordService = {
  /**
   * "Forgot password?": always answers the same way, so nobody can find out which emails
   * have an account. At most three links an hour per account.
   */
  async forgot(email: string, origin: string) {
    await dbConnect();
    const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true }).lean();
    if (user) {
      const recent = await PasswordReset.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 3600_000) } });
      if (recent < 3) {
        const { token } = await issue(user._id);
        const school = (await Settings.findOne().select("schoolName").lean())?.schoolName || "School";
        await messagingService.sendOne(
          await phoneFor(user),
          `${school}: reset your password here (valid ${LINK_MINUTES} minutes): ${origin}/reset-password?token=${token}\nIf you did not ask for this, ignore this message.`
        );
      }
    }
    return { ok: true };
  },

  /** The office sends a reset link for a login — returns it to copy or share on WhatsApp. */
  async linkFor(userId: string, origin: string, actor: SessionUser) {
    await dbConnect();
    const user = await User.findById(userId).lean();
    if (!user) throw new ServiceError("NOT_FOUND", "This person has no login yet", 404);
    const { token, expiresAt } = await issue(user._id, actor.id);
    const link = `${origin}/reset-password?token=${token}`;
    const school = (await Settings.findOne().select("schoolName").lean())?.schoolName || "School";
    const text = `${school}: hello ${user.name}, set a new password for your ${user.role} login (${user.email}) here — the link works once, for ${LINK_MINUTES} minutes:\n${link}`;
    const { sent, waLink } = await messagingService.sendOne(await phoneFor(user), text);
    return { name: user.name, email: user.email, role: user.role, link, expiresAt, sent, waLink };
  },

  /** The logins that belong to a student (theirs and the parent's), teacher or staff member. */
  async loginsOf(kind: "student" | "teacher" | "staff", id: string) {
    await dbConnect();
    const ids: unknown[] = [];
    if (kind === "student") {
      const s = await Student.findById(id).select("user parentUser").lean();
      if (s?.user) ids.push(s.user);
      if (s?.parentUser) ids.push(s.parentUser);
    } else {
      const Model = kind === "teacher" ? Teacher : Staff;
      const p = await Model.findById(id).select("user email").lean();
      if (p?.user) ids.push(p.user);
      else if (p?.email) {
        const u = await User.findOne({ email: p.email }).select("_id").lean();
        if (u) ids.push(u._id);
      }
    }
    const users = await User.find({ _id: { $in: ids } }).select("name email role isActive").lean();
    return users.map((u) => ({ _id: String(u._id), name: u.name, email: u.email, role: u.role, isActive: u.isActive }));
  },

  /** Is this link still good? (The reset page asks before showing the form.) */
  async check(token: string) {
    await dbConnect();
    const row = await PasswordReset.findOne({ tokenHash: hash(token) }).lean();
    if (!row || row.usedAt || row.expiresAt < new Date()) return { valid: false };
    const user = await User.findById(row.userId).select("email name").lean();
    return user ? { valid: true, email: user.email, name: user.name } : { valid: false };
  },

  async reset(token: string, password: string) {
    await dbConnect();
    checkStrength(password);
    const row = await PasswordReset.findOne({ tokenHash: hash(token) });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new ServiceError("VALIDATION", "This link has expired or was already used. Ask for a new one.", 400);
    }
    const user = await User.findById(row.userId);
    if (!user) throw new ServiceError("NOT_FOUND", "Account not found", 404);
    user.password = await hashPassword(password);
    await user.save();
    row.usedAt = new Date();
    await row.save();
    await PasswordReset.deleteMany({ userId: user._id, usedAt: { $exists: false } });
    return { ok: true, email: user.email };
  },

  async change(session: SessionUser, current: string, next: string) {
    await dbConnect();
    const user = await User.findById(session.id);
    if (!user) throw new ServiceError("NOT_FOUND", "Account not found", 404);
    if (!(await verifyPassword(current, user.password))) {
      throw new ServiceError("VALIDATION", "Your current password is not correct", 400);
    }
    if (current === next) throw new ServiceError("VALIDATION", "Choose a password different from the current one", 400);
    checkStrength(next);
    user.password = await hashPassword(next);
    await user.save();
    return { ok: true };
  },
};
