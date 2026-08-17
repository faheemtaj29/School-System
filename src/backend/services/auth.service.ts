/**
 * Auth — login (with portal role check), setup, portal grants.
 */
import { dbConnect } from "@/backend/config/database";
import { User } from "@/backend/models/User";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { Staff } from "@/backend/models/Staff";
import { hashPassword, verifyPassword } from "@/backend/lib/password";
import { startSession } from "@/backend/lib/cookies";
import { ServiceError } from "@/backend/types";
import type {
  LoginInput,
  PortalAccessInput,
  SetupAdminInput,
  StudentSignupInput,
} from "@/backend/validators/auth.validator";

function publicUser(user: { _id: unknown; name: string; email: string; role: string }) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

const PORTAL_LABEL: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  staff: "Staff",
  parent: "Parent",
};

export const authService = {
  async login(input: LoginInput) {
    await dbConnect();
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user || !user.isActive) {
      throw new ServiceError("UNAUTHORIZED", "Invalid email or password", 401);
    }

    const valid = await verifyPassword(input.password, user.password);
    if (!valid) {
      throw new ServiceError("UNAUTHORIZED", "Invalid email or password", 401);
    }

    if (input.expectedRole && user.role !== input.expectedRole && user.role !== "admin") {
      throw new ServiceError(
        "FORBIDDEN",
        `This account is a ${PORTAL_LABEL[user.role] || user.role} login. Open the ${PORTAL_LABEL[user.role]} portal instead.`,
        403
      );
    }

    await startSession({
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return { user: publicUser(user) };
  },

  async setupAdmin(input: SetupAdminInput) {
    await dbConnect();
    const existing = await User.countDocuments();
    if (existing > 0) {
      throw new ServiceError(
        "FORBIDDEN",
        "Setup already completed. Use an existing admin account.",
        403
      );
    }

    const hashed = await hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email.toLowerCase(),
      password: hashed,
      role: "admin",
    });

    await startSession({
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return { user: publicUser(user) };
  },

  /**
   * Student self-registration is allowed only for an active student record
   * whose admission number and school-record email both match.
   */
  async signupStudent(input: StudentSignupInput) {
    await dbConnect();
    const email = input.email.toLowerCase().trim();
    const student = await Student.findOne({
      admissionNo: input.admissionNo.trim(),
      email,
      status: "active",
    });
    if (!student) {
      throw new ServiceError(
        "NOT_FOUND",
        "No active admission matches that admission number and email. Contact the school office.",
        404
      );
    }
    if (student.user) {
      throw new ServiceError(
        "CONFLICT",
        "A portal account already exists for this admission. Sign in or ask the school to reset it.",
        409
      );
    }
    if (await User.exists({ email })) {
      throw new ServiceError(
        "CONFLICT",
        "An account already uses this email. Contact the school office.",
        409
      );
    }

    const user = await User.create({
      name: `${student.firstName} ${student.lastName}`,
      email,
      password: await hashPassword(input.password),
      role: "student",
      isActive: true,
    });
    student.user = user._id;
    await student.save();

    await startSession({
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return { user: publicUser(user) };
  },

  /** Creates or resets portal login and links the people record. */
  async grantPortalAccess(input: PortalAccessInput) {
    await dbConnect();
    const Model =
      input.kind === "teacher" ? Teacher : input.kind === "staff" ? Staff : Student;
    const record = await Model.findById(input.recordId);
    if (!record) {
      throw new ServiceError("NOT_FOUND", `${input.kind} not found`, 404);
    }
    const email = (input.email || record.email || "").toLowerCase().trim();
    if (!email) {
      throw new ServiceError(
        "VALIDATION",
        "Add an email address to this profile before creating a login",
        400
      );
    }
    const clash = await User.findOne({ email });
    if (clash && record.user && String(clash._id) !== String(record.user)) {
      throw new ServiceError("CONFLICT", "Another account already uses this email", 409);
    }
    const password = await hashPassword(input.password);
    const name = `${record.firstName} ${record.lastName}`;
    const user = await User.findOneAndUpdate(
      clash ? { _id: clash._id } : { email },
      { name, email, password, role: input.kind, isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    record.user = user._id;
    if (!record.email) record.email = email;
    await record.save();
    return { email: user.email, role: user.role, created: !clash };
  },
};
