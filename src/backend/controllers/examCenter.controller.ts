import { verifyShareToken } from "@/backend/lib/challanLink";
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { canSeeStudent } from "@/backend/lib/portal";
import { examCenterService } from "@/backend/services/examCenter.service";
import {
  dateSheetPlanSchema,
  dateSheetSaveSchema,
  marksSaveSchema,
  rollNumberSchema,
} from "@/backend/validators/examWorkflow.validator";

const ID = /^[a-f0-9]{24}$/i;

function query(req: Request) {
  const params = new URL(req.url).searchParams;
  const ids = (params.get("classIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID.test(s));
  return {
    termId: params.get("termId") || "",
    classId: params.get("classId") || "",
    subjectId: params.get("subjectId") || "",
    classIds: ids,
  };
}

function needIds(...values: string[]) {
  return values.every((v) => ID.test(v));
}

export const examCenterController = {
  async classes() {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      return jsonOk({ classes: await examCenterService.classesWithSubjects() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async overview(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    const { termId } = query(req);
    if (!needIds(termId)) return jsonError("Select an exam term");
    try {
      return jsonOk(await examCenterService.termOverview(termId));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async plan(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = dateSheetPlanSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await examCenterService.planDateSheet(parsed.data));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveDateSheets(req: Request) {
    const { error, session } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = dateSheetSaveSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await examCenterService.saveDateSheets(parsed.data, session?.id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async rollNumbers(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = rollNumberSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await examCenterService.assignRollNumbers(parsed.data));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async slips(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    const { termId, classIds } = query(req);
    if (!needIds(termId) || !classIds.length) return jsonError("Select a term and classes");
    try {
      return jsonOk(await examCenterService.rollSlips(termId, classIds));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async marksSheet(req: Request) {
    const { error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    const { termId, classId, subjectId } = query(req);
    if (!needIds(termId, classId, subjectId)) return jsonError("Select term, class and subject");
    try {
      return jsonOk(await examCenterService.marksSheet(termId, classId, subjectId));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveMarks(req: Request) {
    const { error, session } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const parsed = marksSaveSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await examCenterService.saveMarks(parsed.data, session?.id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async results(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "staff", "student", "parent"]);
    if (error) return error;
    const { termId, classIds } = query(req);
    if (!needIds(termId) || !classIds.length) return jsonError("Select a term and classes");
    try {
      // Students/parents get only their own child's card — never classmates'.
      if (session!.role === "student" || session!.role === "parent") {
        const student = new URL(req.url).searchParams.get("student") || "";
        if (!(await canSeeStudent(session!, student))) return jsonError("Forbidden", 403);
        const data = await examCenterService.resultCards(termId, classIds);
        return jsonOk({ ...data, batches: data.batches.map((b) => ({ ...b, cards: b.cards.filter((c) => c.student._id === student) })) });
      }
      return jsonOk(await examCenterService.resultCards(termId, classIds));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** GET /api/public/doc?t=<share token> — a result card or date sheet from a WhatsApp/SMS link, no login. */
  async publicDoc(req: Request) {
    try {
      const share = verifyShareToken(new URL(req.url).searchParams.get("t") || "");
      if (!share) return jsonError("This link is not valid", 404);
      if (share.kind === "r") {
        const [termId, classId, studentId] = share.ids;
        const data = await examCenterService.resultCards(termId, [classId]);
        return jsonOk({ ...data, batches: data.batches.map((b) => ({ ...b, cards: b.cards.filter((c) => c.student._id === studentId) })) });
      }
      const [termId, classId] = share.ids;
      const data = await examCenterService.rollSlips(termId, [classId]);
      // The date sheet only: no class list or roll numbers on a public link.
      return jsonOk({ ...data, batches: data.batches.map((b) => ({ ...b, students: [] })) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
