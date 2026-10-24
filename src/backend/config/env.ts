/**
 * Environment configuration.
 * All process.env reads for the backend should go through here.
 */
const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/school-system";
const DEFAULT_JWT_SECRET = "dev-secret-change-me";

export const env = {
  get mongodbUri() {
    return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  },

  get jwtSecret() {
    return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  },

  get isProd() {
    return process.env.NODE_ENV === "production";
  },

  /** Session cookie lifetime in seconds (7 days). */
  sessionMaxAge: 60 * 60 * 24 * 7,
} as const;
