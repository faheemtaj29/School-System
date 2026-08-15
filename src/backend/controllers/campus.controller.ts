/**
 * Campus facility modules HTTP — timetable, library, transport, hostel,
 * medical, cafeteria, assets, documents, AI.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { campusService } from "@/backend/services/campus.service";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const timetableSchema = z.object({
  day: z.string().min(1),
  period: z.coerce.number().min(1).max(12),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  classId: z.string().optional(),
  subjectId: z.string().optional(),
  teacherId: z.string().optional(),
  room: z.string().optional(),
  kind: z.enum(["class", "lab", "exam", "free"]).optional(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
});

const bookSchema = z.object({
  isbn: z.string().optional(),
  title: z.string().min(1),
  author: z.string().optional(),
  publisher: z.string().optional(),
  category: z.string().optional(),
  copies: z.coerce.number().min(1).optional(),
  barcode: z.string().optional(),
  location: z.string().optional(),
});

const issueSchema = z.object({
  bookId: z.string().min(1),
  borrowerName: z.string().optional(),
  borrowerType: z.enum(["student", "staff", "teacher"]).optional(),
  borrowerId: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional(),
  notes: z.string().optional(),
});

const vehicleSchema = z.object({
  code: z.string().optional().or(z.literal("")),
  plateNo: z.string().min(1),
  type: z.enum(["bus", "van", "car", "other"]).optional(),
  capacity: z.coerce.number().min(1).optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  driverStaffId: z.string().optional(),
  routeName: z.string().optional(),
  stops: z.array(z.string()).optional(),
  gpsReady: z.boolean().optional(),
  status: z.enum(["active", "maintenance", "inactive"]).optional(),
  notes: z.string().optional(),
});

const roomSchema = z.object({
  hostelName: z.string().min(1),
  building: z.string().optional(),
  floor: z.string().optional(),
  roomNo: z.string().min(1),
  beds: z.coerce.number().min(1).optional(),
  gender: z.enum(["male", "female", "any"]).optional(),
  monthlyFee: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

const allocateSchema = z.object({
  roomId: z.string().min(1),
  studentName: z.string().optional(),
  studentId: z.string().optional(),
  bedNo: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const visitSchema = z.object({
  personType: z.enum(["student", "staff", "teacher"]).optional(),
  personName: z.string().optional(),
  personId: z.string().optional(),
  visitDate: z.string().optional(),
  complaint: z.string().min(1),
  diagnosis: z.string().optional(),
  prescription: z.string().optional(),
  doctor: z.string().optional(),
  severity: z.enum(["normal", "urgent", "emergency"]).optional(),
  notes: z.string().optional(),
});

const cafeItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
});

const cafeSaleSchema = z.object({
  buyerName: z.string().optional(),
  buyerType: z.enum(["student", "staff", "guest"]).optional(),
  buyerId: z.string().optional(),
  lines: z
    .array(z.object({ itemId: z.string(), qty: z.coerce.number().min(1) }))
    .min(1),
  paid: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

const assetSchema = z.object({
  tag: z.string().optional().or(z.literal("")),
  name: z.string().min(1),
  category: z.string().optional(),
  location: z.string().optional(),
  assignedTo: z.string().optional(),
  assignedPersonType: z.enum(["student", "staff", "teacher"]).optional(),
  assignedPersonId: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.coerce.number().min(0).optional(),
  warrantyUntil: z.string().optional(),
  status: z.enum(["in_use", "repair", "disposed", "idle"]).optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

const docSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  ownerType: z
    .enum(["student", "staff", "teacher", "admission", "vendor", "finance", "other"])
    .optional(),
  ownerName: z.string().optional(),
  ownerId: z.string().optional(),
  fileUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const aiSchema = z.object({
  kind: z.enum([
    "admission_assistant",
    "chatbot",
    "performance",
    "weak_students",
    "report",
    "paper",
    "mcq",
    "fee_prediction",
    "insight",
  ]),
  prompt: z.string().min(3),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const campusController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      const view = params.get("view") || "overview";
      if (view === "timetable") {
        return jsonOk({
          slots: await campusService.listTimetable({
            classId: params.get("classId"),
            teacherId: params.get("teacherId"),
          }),
        });
      }
      if (view === "library") return jsonOk(await campusService.listLibrary());
      if (view === "transport") {
        return jsonOk({ vehicles: await campusService.listTransport() });
      }
      if (view === "hostel") return jsonOk(await campusService.listHostel());
      if (view === "medical") {
        return jsonOk({ visits: await campusService.listMedical() });
      }
      if (view === "cafeteria") return jsonOk(await campusService.listCafe());
      if (view === "assets") {
        return jsonOk({ assets: await campusService.listAssets() });
      }
      if (view === "documents") {
        return jsonOk({ documents: await campusService.listDocuments() });
      }
      if (view === "ai") return jsonOk({ jobs: await campusService.listAiJobs() });
      if (view === "directory") return jsonOk(await campusService.directory());
      return jsonOk(await campusService.overview());
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      /** `module` is the action; domain fields may also use `kind`. */
      const mod = (body.module || body.kind) as string;

      if (mod === "timetable") {
        const parsed = timetableSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ slot: await campusService.createTimetable(parsed.data) }, 201);
      }
      if (mod === "book") {
        const parsed = bookSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ book: await campusService.createBook(parsed.data) }, 201);
      }
      if (mod === "issue") {
        const parsed = issueSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ loan: await campusService.issueBook(parsed.data) }, 201);
      }
      if (mod === "return") {
        return jsonOk({
          loan: await campusService.returnBook(body.loanId, Number(body.fine) || 0),
        });
      }
      if (mod === "vehicle") {
        const parsed = vehicleSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ vehicle: await campusService.createVehicle(parsed.data) }, 201);
      }
      if (mod === "room") {
        const parsed = roomSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ room: await campusService.createRoom(parsed.data) }, 201);
      }
      if (mod === "allocate") {
        const parsed = allocateSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { allocation: await campusService.allocateBed(parsed.data) },
          201
        );
      }
      if (mod === "vacate") {
        return jsonOk({ allocation: await campusService.vacateBed(body.allocationId) });
      }
      if (mod === "visit") {
        const parsed = visitSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ visit: await campusService.createVisit(parsed.data) }, 201);
      }
      if (mod === "cafe-item") {
        const parsed = cafeItemSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ item: await campusService.createCafeItem(parsed.data) }, 201);
      }
      if (mod === "cafe-sale") {
        const parsed = cafeSaleSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ sale: await campusService.createCafeSale(parsed.data) }, 201);
      }
      if (mod === "asset") {
        const parsed = assetSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ asset: await campusService.createAsset(parsed.data) }, 201);
      }
      if (mod === "document") {
        const parsed = docSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { document: await campusService.createDocument(parsed.data, session) },
          201
        );
      }
      if (mod === "document-bump") {
        return jsonOk({
          document: await campusService.bumpDocument(body.id, body.note, session),
        });
      }
      if (mod === "ai") {
        const parsed = aiSchema.safeParse({
          kind: body.aiKind || body.jobKind || body.kind,
          prompt: body.prompt,
          meta: body.meta,
        });
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ job: await campusService.runAi(parsed.data, session) }, 201);
      }
      return jsonError("Unknown campus action");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const mod = body.module || body.kind;
      if (mod === "vehicle") {
        return jsonOk({ vehicle: await campusService.updateVehicle(id, body) });
      }
      if (mod === "asset") {
        return jsonOk({ asset: await campusService.updateAsset(id, body) });
      }
      return jsonError("Unknown update kind");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const kind = new URL(req.url).searchParams.get("kind");
      if (kind === "timetable") return jsonOk(await campusService.removeTimetable(id));
      if (kind === "book") return jsonOk(await campusService.removeBook(id));
      if (kind === "vehicle") return jsonOk(await campusService.removeVehicle(id));
      if (kind === "room") return jsonOk(await campusService.removeRoom(id));
      if (kind === "visit") return jsonOk(await campusService.removeVisit(id));
      if (kind === "cafe-item") return jsonOk(await campusService.removeCafeItem(id));
      if (kind === "asset") return jsonOk(await campusService.removeAsset(id));
      if (kind === "document") return jsonOk(await campusService.removeDocument(id));
      return jsonError("Specify ?kind=");
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
