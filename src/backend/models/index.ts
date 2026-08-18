/**
 * Mongoose models (MongoDB collections).
 *
 * One file = one collection.
 * Related refs use populate() inside services.
 */
export { User } from "./User";
export { ClassModel } from "./Class";
export { Subject } from "./Subject";
export { Teacher } from "./Teacher";
export { Student } from "./Student";
export { Attendance } from "./Attendance";
export { Exam } from "./Exam";
export { Fee } from "./Fee";
export { Settings } from "./Settings";
export { AcademicSession } from "./AcademicSession";
export { ExamTypeMaster, ExamTerm, ExamSchedule } from "./ExamWorkflow";
export { LedgerEntry } from "./Ledger";
export { Account, Voucher, AccountingCounter, type VoucherStatus, type VoucherType } from "./Accounting";
export { InventoryItem, StockVoucher, type StockVoucherType } from "./Inventory";
export { LeaveRequest, Payslip } from "./HR";
export { Notice } from "./Notice";
export { Course, Lecture, Enrollment, Diploma } from "./ELearning";
export { SiteContent, Admission } from "./Site";
export { Staff } from "./Staff";
export {
  Tax,
  Warehouse,
  StockLedger,
  Customer,
  Supplier,
  AiDocument,
  AiTransaction,
  AiCorrection,
  AiAuditLog,
  WhatsAppUser,
  WhatsAppMessage,
  type AiDocumentType,
  type AiDocumentStatus,
  type AiTransactionStatus,
  type StockMovementType,
  type WhatsAppMessageDirection,
  type WhatsAppMessageType,
} from "./AiModels";
export {
  Institution,
  CustomField,
  WorkflowDefinition,
  WorkflowInstance,
  AuditEvent,
} from "./Platform";
export {
  TimetableSlot,
  LibraryBook,
  LibraryLoan,
  TransportVehicle,
  HostelRoom,
  HostelAllocation,
  MedicalVisit,
  CafeItem,
  CafeSale,
  Asset,
  ManagedDocument,
  AiJob,
} from "./CampusModules";
