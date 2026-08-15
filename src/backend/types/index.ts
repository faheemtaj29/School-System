/**
 * Shared backend types.
 */
export type UserRole = "admin" | "teacher" | "student" | "parent" | "staff";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type ServiceErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function statusForCode(code: ServiceErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "INTERNAL":
      return 500;
    default:
      return 400;
  }
}
