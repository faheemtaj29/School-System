/**
 * Environment configuration.
 * All process.env reads for the backend should go through here.
 */
export const env = {
  get mongodbUri() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Missing MONGODB_URI in .env.local");
    }
    return uri;
  },

  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("Missing JWT_SECRET in .env.local");
    }
    return secret;
  },

  get isProd() {
    return process.env.NODE_ENV === "production";
  },

  /** Session cookie lifetime in seconds (7 days). */
  sessionMaxAge: 60 * 60 * 24 * 7,
} as const;
