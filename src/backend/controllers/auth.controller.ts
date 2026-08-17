/**
 * Auth HTTP handlers.
 */
import { clearSessionCookie, getSession } from "@/backend/lib/cookies";
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { authService } from "@/backend/services/auth.service";
import {
  loginSchema,
  portalAccessSchema,
  setupAdminSchema,
  studentSignupSchema,
} from "@/backend/validators/auth.validator";

export const authController = {
  async login(req: Request) {
    try {
      const body = await req.json();
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const data = await authService.login(parsed.data);
      return jsonOk(data);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async setup(req: Request) {
    try {
      const body = await req.json();
      const parsed = setupAdminSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(firstZodError(parsed.error.issues) || "Name, email and password are required");
      }
      const data = await authService.setupAdmin(parsed.data);
      return jsonOk(data, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async signupStudent(req: Request) {
    try {
      const parsed = studentSignupSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await authService.signupStudent(parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async logout() {
    await clearSessionCookie();
    return jsonOk({ ok: true });
  },

  async me() {
    const session = await getSession();
    if (!session) return jsonError("Unauthorized", 401);
    return jsonOk({ user: session });
  },

  async grantAccess(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = portalAccessSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await authService.grantPortalAccess(parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
