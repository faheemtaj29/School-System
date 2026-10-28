/**
 * Start fresh — GET shows what each group holds, POST clears the chosen groups (admin only,
 * the word RESET must be typed to confirm).
 */
import { z } from "zod";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { RESET_GROUPS, resetService } from "@/backend/services/reset.service";

const runSchema = z.object({
  groups: z.array(z.enum(RESET_GROUPS.map((g) => g.key) as [string, ...string[]])).min(1, "Tick at least one thing to clear"),
  confirm: z.literal("RESET", { message: "Type RESET to confirm" }),
});

export const resetController = {
  async preview() {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      return jsonOk({ groups: resetService.groups(), counts: await resetService.preview() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async run(req: Request) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = runSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await resetService.run(parsed.data.groups as never, session!));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
