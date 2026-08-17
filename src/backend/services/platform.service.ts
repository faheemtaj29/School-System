/**
 * Platform extensibility — institutions, custom fields, workflows, audit.
 * Approvals sync into Leave, Fee Waiver, and Admission masters.
 */
import { dbConnect } from "@/backend/config/database";
import {
  AuditEvent,
  CustomField,
  Institution,
  WorkflowDefinition,
  WorkflowInstance,
} from "@/backend/models/Platform";
import { Settings } from "@/backend/models/Settings";
import { LeaveRequest } from "@/backend/models/HR";
import { Student } from "@/backend/models/Student";
import { Admission } from "@/backend/models/Site";
import { ServiceError, type SessionUser } from "@/backend/types";

const ADMISSION_STEP_STATUS: Record<number, string> = {
  0: "new",
  1: "test",
  2: "merit",
  3: "offered",
  4: "enrolled",
};

async function syncWorkflowSubjects(
  instance: {
    workflowCode: string;
    subjectId: string;
    status: string;
    currentStep: number;
    payload?: Record<string, unknown>;
  },
  outcome: "step" | "approved" | "rejected"
) {
  if (instance.workflowCode === "LEAVE") {
    if (outcome === "approved" || outcome === "rejected") {
      await LeaveRequest.findByIdAndUpdate(instance.subjectId, {
        status: outcome === "approved" ? "approved" : "rejected",
      });
    }
    return;
  }

  if (instance.workflowCode === "FEE_WAIVER" && outcome === "approved") {
    const percent = Number(instance.payload?.percent ?? 30);
    const discountType = String(instance.payload?.discountType || "need_based");
    await Student.findByIdAndUpdate(instance.subjectId, {
      discountType: ["none", "teacher_child", "staff_child", "sibling", "merit", "need_based", "custom"].includes(
        discountType
      )
        ? discountType
        : "need_based",
      discountPercent: Math.min(100, Math.max(0, percent)),
    });
    return;
  }

  if (instance.workflowCode === "ADMISSION") {
    const status =
      outcome === "rejected"
        ? "rejected"
        : outcome === "approved"
          ? "enrolled"
          : ADMISSION_STEP_STATUS[instance.currentStep] || "contacted";
    await Admission.findByIdAndUpdate(instance.subjectId, { status });
  }
}

const DEFAULT_WORKFLOWS = [
  {
    code: "LEAVE",
    name: "Staff / Teacher Leave",
    category: "leave",
    steps: [
      { key: "submit", label: "Submitted", role: "teacher", order: 0 },
      { key: "hr", label: "HR review", role: "staff", order: 1 },
      { key: "principal", label: "Principal approval", role: "admin", order: 2 },
    ],
  },
  {
    code: "FEE_WAIVER",
    name: "Fee Waiver / Concession",
    category: "fee_waiver",
    steps: [
      { key: "submit", label: "Requested", role: "staff", order: 0 },
      { key: "finance", label: "Finance review", role: "staff", order: 1 },
      { key: "principal", label: "Director approval", role: "admin", order: 2 },
    ],
  },
  {
    code: "PURCHASE",
    name: "Purchase Request",
    category: "purchase",
    steps: [
      { key: "submit", label: "Requested", role: "staff", order: 0 },
      { key: "dept", label: "Department head", role: "admin", order: 1 },
      { key: "finance", label: "Finance", role: "staff", order: 2 },
      { key: "director", label: "Principal / Director", role: "admin", order: 3 },
    ],
  },
  {
    code: "SCHOLARSHIP",
    name: "Scholarship / Financial Aid",
    category: "scholarship",
    steps: [
      { key: "submit", label: "Applied", role: "student", order: 0 },
      { key: "committee", label: "Committee", role: "teacher", order: 1 },
      { key: "finance", label: "Finance", role: "staff", order: 2 },
      { key: "principal", label: "Final approval", role: "admin", order: 3 },
    ],
  },
  {
    code: "ADMISSION",
    name: "Admission Approval",
    category: "admission",
    steps: [
      { key: "apply", label: "Application", role: "admin", order: 0 },
      { key: "test", label: "Entry test / interview", role: "teacher", order: 1 },
      { key: "merit", label: "Merit list", role: "admin", order: 2 },
      { key: "fee", label: "Fee confirmed", role: "staff", order: 3 },
      { key: "enroll", label: "Enrollment", role: "admin", order: 4 },
    ],
  },
];

async function ensureInstitution() {
  await dbConnect();
  const settings = await Settings.findOne().lean();
  const code = (settings?.institutionCode || settings?.defaultBranchCode || "MAIN").toUpperCase();
  const name = settings?.schoolName || "Sabaq Institution";
  const type = settings?.institutionType || "school";
  let inst = await Institution.findOne({ code });
  if (!inst) {
    inst = await Institution.create({
      code,
      name,
      type,
      registrationNo: settings?.registrationNo,
      isActive: true,
    });
  } else if (settings?.institutionType && inst.type !== settings.institutionType) {
    inst.type = settings.institutionType;
    inst.name = name;
    await inst.save();
  }
  return inst;
}

export const platformService = {
  async overview() {
    const inst = await ensureInstitution();
    const [fields, workflows, pending, audits] = await Promise.all([
      CustomField.countDocuments({ institutionCode: inst.code, active: true }),
      WorkflowDefinition.countDocuments({ institutionCode: inst.code, active: true }),
      WorkflowInstance.countDocuments({ institutionCode: inst.code, status: "pending" }),
      AuditEvent.countDocuments({ institutionCode: inst.code }),
    ]);
    return {
      institution: inst,
      stats: { fields, workflows, pending, audits },
      roadmap: [
        { key: "sis", label: "Student Information System", status: "live" },
        { key: "lms", label: "Distance / LMS", status: "live" },
        { key: "exams", label: "Exams & result cards", status: "live" },
        { key: "fees", label: "Fees + concessions", status: "live" },
        { key: "accounting", label: "Double-entry accounting", status: "live" },
        { key: "hr", label: "HR & payroll", status: "live" },
        { key: "inventory", label: "Inventory", status: "live" },
        { key: "cms", label: "Website & admissions", status: "live" },
        { key: "platform", label: "Extensibility (fields / workflow / audit)", status: "live" },
        { key: "timetable", label: "Timetable", status: "live" },
        { key: "library", label: "Library", status: "live" },
        { key: "transport", label: "Transport", status: "live" },
        { key: "hostel", label: "Hostel", status: "live" },
        { key: "medical", label: "Medical / clinic", status: "live" },
        { key: "cafeteria", label: "Cafeteria / POS", status: "live" },
        { key: "assets", label: "Assets & maintenance", status: "live" },
        { key: "documents", label: "Document management", status: "live" },
        { key: "ai", label: "AI service layer", status: "live" },
        { key: "gpa", label: "GPA / CGPA / transcripts", status: "planned" },
        { key: "parent", label: "Full parent portal", status: "planned" },
        { key: "multitenant", label: "Multi-institution SaaS", status: "foundation" },
      ],
    };
  },

  async seedDefaults() {
    const inst = await ensureInstitution();
    let workflows = 0;
    for (const wf of DEFAULT_WORKFLOWS) {
      await WorkflowDefinition.findOneAndUpdate(
        { institutionCode: inst.code, code: wf.code },
        { ...wf, institutionCode: inst.code, active: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      workflows += 1;
    }
    const starterFields = [
      {
        entity: "student",
        key: "blood_group",
        label: "Blood group",
        fieldType: "select" as const,
        options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      },
      {
        entity: "student",
        key: "previous_school",
        label: "Previous school",
        fieldType: "text" as const,
        options: [],
      },
      {
        entity: "student",
        key: "cnic_form_b",
        label: "CNIC / Form-B",
        fieldType: "text" as const,
        options: [],
      },
      {
        entity: "teacher",
        key: "qualification_detail",
        label: "Highest qualification detail",
        fieldType: "text" as const,
        options: [],
      },
      {
        entity: "admission",
        key: "how_heard",
        label: "How did you hear about us?",
        fieldType: "select" as const,
        options: ["Website", "Social media", "Referral", "Walk-in", "Other"],
      },
    ];
    let fields = 0;
    for (const [i, f] of starterFields.entries()) {
      await CustomField.findOneAndUpdate(
        { institutionCode: inst.code, entity: f.entity, key: f.key },
        { ...f, institutionCode: inst.code, active: true, required: false, sortOrder: i },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      fields += 1;
    }
    return { institution: inst.code, workflows, fields };
  },

  async listFields(entity?: string | null) {
    const inst = await ensureInstitution();
    const filter: Record<string, unknown> = { institutionCode: inst.code, active: true };
    if (entity) filter.entity = entity.toLowerCase();
    return CustomField.find(filter).sort({ entity: 1, sortOrder: 1 }).lean();
  },

  async upsertField(input: {
    entity: string;
    key: string;
    label: string;
    fieldType: string;
    options?: string[];
    required?: boolean;
    helpText?: string;
    sortOrder?: number;
  }) {
    const inst = await ensureInstitution();
    const key = input.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new ServiceError("VALIDATION", "Field key must be snake_case letters", 400);
    }
    return CustomField.findOneAndUpdate(
      { institutionCode: inst.code, entity: input.entity.toLowerCase(), key },
      {
        institutionCode: inst.code,
        entity: input.entity.toLowerCase(),
        key,
        label: input.label,
        fieldType: input.fieldType,
        options: input.options || [],
        required: Boolean(input.required),
        helpText: input.helpText,
        sortOrder: input.sortOrder ?? 0,
        active: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  },

  async listWorkflows() {
    const inst = await ensureInstitution();
    return WorkflowDefinition.find({ institutionCode: inst.code })
      .sort({ category: 1, name: 1 })
      .lean();
  },

  async listInstances(status?: string | null) {
    const inst = await ensureInstitution();
    const filter: Record<string, unknown> = { institutionCode: inst.code };
    if (status) filter.status = status;
    return WorkflowInstance.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  },

  async startWorkflow(
    input: {
      workflowCode: string;
      subjectType: string;
      subjectId: string;
      title: string;
      payload?: Record<string, unknown>;
      note?: string;
    },
    session: SessionUser
  ) {
    const inst = await ensureInstitution();
    const def = await WorkflowDefinition.findOne({
      institutionCode: inst.code,
      code: input.workflowCode.toUpperCase(),
      active: true,
    }).lean();
    if (!def) throw new ServiceError("NOT_FOUND", "Workflow not found — seed platform defaults first", 404);
    const first = [...def.steps].sort((a, b) => a.order - b.order)[0];
    const instance = await WorkflowInstance.create({
      institutionCode: inst.code,
      workflowCode: def.code,
      category: def.category,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
      status: "pending",
      currentStep: first?.order ?? 0,
      history: [
        {
          stepKey: first?.key || "submit",
          action: "submit",
          byUserId: session.id,
          byName: session.name,
          note: input.note,
          at: new Date(),
        },
      ],
      payload: input.payload || {},
      createdBy: session.id,
    });
    await this.audit({
      session,
      action: "workflow.start",
      entity: "workflow",
      entityId: String(instance._id),
      summary: `Started ${def.name}: ${input.title}`,
    });
    return instance;
  },

  async advanceWorkflow(
    id: string,
    input: { action: "approve" | "reject" | "comment"; note?: string },
    session: SessionUser
  ) {
    const instance = await WorkflowInstance.findById(id);
    if (!instance) throw new ServiceError("NOT_FOUND", "Workflow instance not found", 404);
    if (instance.status !== "pending") {
      throw new ServiceError("CONFLICT", "This request is already closed", 409);
    }
    const def = await WorkflowDefinition.findOne({
      institutionCode: instance.institutionCode,
      code: instance.workflowCode,
    }).lean();
    if (!def) throw new ServiceError("NOT_FOUND", "Workflow definition missing", 404);

    const steps = [...def.steps].sort((a, b) => a.order - b.order);
    const current = steps.find((s) => s.order === instance.currentStep) || steps[0];

    if (input.action === "reject") {
      instance.status = "rejected";
      instance.history.push({
        stepKey: current.key,
        action: "reject",
        byUserId: session.id as never,
        byName: session.name,
        note: input.note,
        at: new Date(),
      });
      await instance.save();
      await syncWorkflowSubjects(
        {
          workflowCode: instance.workflowCode,
          subjectId: String(instance.subjectId),
          status: instance.status,
          currentStep: instance.currentStep,
          payload: (instance.payload || {}) as Record<string, unknown>,
        },
        "rejected"
      );
      await this.audit({
        session,
        action: "workflow.reject",
        entity: "workflow",
        entityId: id,
        summary: `Rejected ${instance.title}`,
      });
      return instance;
    }

    if (input.action === "comment") {
      instance.history.push({
        stepKey: current.key,
        action: "comment",
        byUserId: session.id as never,
        byName: session.name,
        note: input.note,
        at: new Date(),
      });
      await instance.save();
      return instance;
    }

    const next = steps.find((s) => s.order > instance.currentStep);
    instance.history.push({
      stepKey: current.key,
      action: "approve",
      byUserId: session.id as never,
      byName: session.name,
      note: input.note,
      at: new Date(),
    });
    if (!next) {
      instance.status = "approved";
    } else {
      instance.currentStep = next.order;
    }
    await instance.save();
    await syncWorkflowSubjects(
      {
        workflowCode: instance.workflowCode,
        subjectId: String(instance.subjectId),
        status: instance.status,
        currentStep: instance.currentStep,
        payload: (instance.payload || {}) as Record<string, unknown>,
      },
      next ? "step" : "approved"
    );
    await this.audit({
      session,
      action: next ? "workflow.approve_step" : "workflow.approve",
      entity: "workflow",
      entityId: id,
      summary: next ? `Advanced ${instance.title} → ${next.label}` : `Approved ${instance.title}`,
    });
    return instance;
  },

  async listAudit(limit = 50) {
    const inst = await ensureInstitution();
    return AuditEvent.find({ institutionCode: inst.code })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  },

  async audit(input: {
    session?: SessionUser | null;
    action: string;
    entity: string;
    entityId?: string;
    summary: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }) {
    const inst = await ensureInstitution();
    return AuditEvent.create({
      institutionCode: inst.code,
      actorId: input.session?.id,
      actorName: input.session?.name,
      actorRole: input.session?.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
      before: input.before,
      after: input.after,
    });
  },
};
