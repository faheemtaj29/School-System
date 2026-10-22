/**
 * MongoDB connection (cached for Next.js hot reload / serverless).
 */
import mongoose from "mongoose";
import { env } from "./env";
import "@/backend/models";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

global.mongooseCache = cached;

export async function dbConnect() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongodbUri, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // Don't keep a failed attempt cached — e.g. the app started before MongoDB did.
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
