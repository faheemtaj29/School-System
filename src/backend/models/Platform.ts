/**
 * Platform extensibility core — Institution (multi-tenant prep),
 * custom fields, reusable approval workflows, and audit trail.
 * Future modules (Library, Transport, Hostel…) plug into these
 * without rebuilding the database shape.
 */
import { Schema, models, model, Types } from "mongoose";

export type InstitutionType = "school" | "college" | "university" | "academy";

export interface IInstitution {
  code: string;
  name: string;
  type: InstitutionType;
  legalName?: string;
  registrationNo?: string;
  isActive: boolean;
  /** Soft feature flags — turn modules on without redeploy. */
  modules: string[];
  createdAt: Date;
  updatedAt: Date;
}

const InstitutionSchema = new Schema<IInstitution>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["school", "college", "university", "academy"],
      default: "school",
    },
    legalName: String,
    registrationNo: String,
    isActive: { type: Boolean, default: true },
    modules: {
      type: [String],
      default: [
        "sis",
        "admissions",
        "academics",
        "lms",
        "exams",
        "attendance",
        "fees",
        "hr",
        "payroll",
        "accounting",
        "inventory",
        "cms",
        "reports",
        "timetable",
        "library",
        "transport",
        "hostel",
        "medical",
        "cafeteria",
        "assets",
        "documents",
        "ai",
      ],
    },
  },
  { timestamps: true }
);

export const Institution =
  models.Institution || model<IInstitution>("Institution", InstitutionSchema);

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  | "file";

export interface ICustomField {
  institutionCode: string;
  /** Entity this field hangs on — student, teacher, fee, admission… */
  entity: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
  helpText?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldSchema = new Schema<ICustomField>(
  {
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    entity: { type: String, required: true, lowercase: true, trim: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    fieldType: {
      type: String,
      enum: ["text", "number", "date", "boolean", "select", "multiselect", "file"],
      default: "text",
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    helpText: String,
  },
  { timestamps: true }
);

CustomFieldSchema.index({ institutionCode: 1, entity: 1, key: 1 }, { unique: true });

export const CustomField =
  models.CustomField || model<ICustomField>("CustomField", CustomFieldSchema);

export interface IWorkflowStep {
  key: string;
  label: string;
  /** Role that can approve this step (admin, teacher, staff… or custom). */
  role: string;
  order: number;
}

export interface IWorkflowDefinition {
  institutionCode: string;
  code: string;
  name: string;
  /** leave | scholarship | admission | purchase | fee_waiver | expense | salary | custom */
  category: string;
  steps: IWorkflowStep[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStepSchema = new Schema<IWorkflowStep>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    role: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const WorkflowDefinitionSchema = new Schema<IWorkflowDefinition>(
  {
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, lowercase: true, trim: true },
    steps: { type: [WorkflowStepSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

WorkflowDefinitionSchema.index({ institutionCode: 1, code: 1 }, { unique: true });

export const WorkflowDefinition =
  models.WorkflowDefinition ||
  model<IWorkflowDefinition>("WorkflowDefinition", WorkflowDefinitionSchema);

export interface IWorkflowInstance {
  institutionCode: string;
  workflowCode: string;
  /** leave, purchase, scholarship… */
  category: string;
  subjectType: string;
  subjectId: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentStep: number;
  history: {
    stepKey: string;
    action: "submit" | "approve" | "reject" | "comment";
    byUserId?: Types.ObjectId;
    byName?: string;
    note?: string;
    at: Date;
  }[];
  payload: Record<string, unknown>;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowInstanceSchema = new Schema<IWorkflowInstance>(
  {
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    workflowCode: { type: String, required: true, uppercase: true, trim: true },
    category: { type: String, required: true, lowercase: true, trim: true },
    subjectType: { type: String, required: true },
    subjectId: { type: String, required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    currentStep: { type: Number, default: 0 },
    history: [
      {
        stepKey: String,
        action: { type: String, enum: ["submit", "approve", "reject", "comment"] },
        byUserId: { type: Schema.Types.ObjectId, ref: "User" },
        byName: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    payload: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

WorkflowInstanceSchema.index({ institutionCode: 1, status: 1, category: 1 });
WorkflowInstanceSchema.index({ subjectType: 1, subjectId: 1 });

export const WorkflowInstance =
  models.WorkflowInstance ||
  model<IWorkflowInstance>("WorkflowInstance", WorkflowInstanceSchema);

export interface IAuditEvent {
  institutionCode: string;
  actorId?: Types.ObjectId;
  actorName?: string;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    institutionCode: { type: String, required: true, uppercase: true, trim: true, default: "MAIN" },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: String,
    summary: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: true }
);

AuditEventSchema.index({ institutionCode: 1, createdAt: -1 });
AuditEventSchema.index({ entity: 1, entityId: 1 });

export const AuditEvent =
  models.AuditEvent || model<IAuditEvent>("AuditEvent", AuditEventSchema);
