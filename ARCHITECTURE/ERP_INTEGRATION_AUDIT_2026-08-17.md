# ERP Integration Audit — 2026-08-17

## 1) Executive Summary

The project is already a real integrated Next.js + backend service architecture, not a pure UI prototype.
Core modules (Accounting, Inventory, Classes, Subjects, Exams, Fees, Reports, HR, Campus Ops) are implemented and database-backed via MongoDB/Mongoose.

Primary issue is not "missing modules" but integration depth and workflow completeness:
- Exam workflow is currently exam-centric, not full Term -> Timetable -> Marks -> Approval -> Final Card lifecycle.
- Inventory-accounting integration exists but posting semantics are simplified and do not cover full payable/receivable/COGS journal patterns.
- No migration framework is currently wired; seed scripts exist.
- Navigation and role access are present but ERP taxonomy differs from requested target structure.

## 2) Architecture Identified

### Frontend Architecture
- Framework: Next.js App Router.
- Logged-in routes: src/app/(app) pages.
- API entry points: thin handlers in src/app/api.
- Main sidebar shell and role filtering: src/components/AppShell.tsx.

### Backend Architecture
- Layered backend in src/backend:
  - controllers -> validators -> services -> models.
- HTTP auth/role checks centralized via requireAuth in backend lib.
- Controllers are thin orchestration; services contain business logic.

### Database Architecture
- Database: MongoDB with Mongoose.
- Active connection bootstrap: src/backend/config/database.ts.
- Env binding: src/backend/config/env.ts (MONGODB_URI, JWT_SECRET).
- Active runtime URI (masked): mongodb://127.0.0.1:27017/school-system.
- Active DB name: school-system.

## 3) Database Assets Located

### Models/Schemas
- Core: User, Student, Teacher, Staff, Class, Subject, Attendance, Exam, Fee, Settings.
- Finance/Ops: Accounting (Account, Voucher, Counter), Ledger, Inventory (Item, StockVoucher).
- Platform extensibility: Institution, CustomField, WorkflowDefinition, WorkflowInstance, AuditEvent.
- Academic lifecycle: AcademicSession.
- Campus suite: TimetableSlot, Library, Transport, Hostel, Medical, Cafeteria, Assets, Documents, AI jobs.

### Seed/Migration Files
- scripts/mongo/seed_coa.js
- scripts/mongo/seed_workflows.js
- scripts/mongo/README.md
- No formal migration pipeline currently configured (no migrate-mongo scripts in package.json).

## 4) Module Reality Check

### Implemented and DB-Backed (Reusable as-is)
- Accounting: chart, vouchers, trial balance, P/L, balance sheet, day book, ledger reports.
- Inventory: product master, stock vouchers, posting/void flow, stock stats.
- Classes/Subjects: CRUD plus curriculum import and class-subject assignment through class.subjects.
- Exams: exam schedule + embedded marks per exam.
- Fees: fee heads, bulk challan, installments, waiver workflow trigger, late fees.
- Reports: overview, result cards, transcript, class strength, fees, attendance, finance, inventory.
- Sessions/Academic year: create/activate/close/reopen, class copy.
- Campus Ops: timetable + facilities modules.

### Partial / Workflow Incomplete
- Exam domain: lacks dedicated ExamTerm master and configurable exam types beyond enum.
- Timetable for examinations: generic timetable exists, but no explicit exam-timetable lifecycle with publish/unpublish and export.
- Result governance: no dedicated result status state machine (draft/submitted/verified/approved/published) at subject-result granularity.
- Multi-term weighted final result formulas: not yet modeled as configurable policy engine.
- Accounting-Inventory deep journal logic: present but simplified compared to full ERP-level AP/AR and COGS split requirements.
- Audit trail for marks changes: platform audit model exists but result-entry-specific audit flow not yet wired.

### UI Prototype Indicators (Not Fully End-to-End)
- Some dashboard/readout views aggregate from existing data but do not enforce strict accounting period close controls.
- Campus timetable supports exam kind but is not yet integrated with exam term/schedule publication workflow.

## 5) Broken/Incomplete Links Identified

1. Examination lifecycle gap:
- Current exam model stores examType enum and embedded results.
- Missing entities for ExamTerm, ExamTimetableRow, ResultApproval, ResultPolicy.

2. Subject auto-load source alignment:
- Class-subject assignments exist via Class.subjects.
- Exam timetable workflow is not consuming these assignments in a dedicated exam scheduler UI/API.

3. Inventory -> Accounting posting semantics:
- Integration exists through inventoryService -> accountingService.upsertLinked.
- Current linked posting maps to cash/opposite style entries; full AP/AR + tax + COGS split journals are not completely represented for all transaction types.

4. Migration safety:
- Seed scripts exist, but schema evolution path for production is not formalized.

5. Result status and authorization:
- Role auth exists generally, but no dedicated result publish/lock pipeline to prevent post-publication edits without controlled correction.

## 6) Data Protection Status

Current state supports safe incremental evolution:
- Existing IDs and collections should be preserved.
- No destructive migration required for phase 1.
- New entities can be additive.

Mandatory before schema changes:
1. Run Mongo backup:
   - mongodump --uri "mongodb://127.0.0.1:27017/school-system" --out ./backups/school-system-YYYYMMDD
2. Snapshot collection counts and indexes.
3. Introduce migration scripts (idempotent) before adding new relations.

## 7) Integration Plan (Incremental, Non-Destructive)

## Phase A: Stabilization and Guard Rails
1. Add migration scaffold (scripts/migrations + runner).
2. Add backup/check script and pre-migration checklist.
3. Add integration smoke tests for core CRUD and posting paths.

## Phase B: Exam Domain Completion
1. Add models:
   - ExamTypeMaster
   - ExamTerm
   - ExamSchedule
   - ResultEntry
   - ResultPublish / ResultRevision
2. Keep existing Exam collection operational; introduce compatibility adapters.
3. Build APIs to auto-load class subjects from Class.subjects into exam schedule rows.
4. Add validations: time overlap, marks bounds, term period checks, duplicate prevention.

## Phase C: Result Engine and Cards
1. Add configurable ResultPolicy (weights/formula mode).
2. Add term-wise and cumulative calculators.
3. Add status workflow: draft -> submitted -> verified -> approved -> published.
4. Add immutable publish snapshots and correction workflow.
5. Extend card/transcript rendering for school + university modes.

## Phase D: Accounting-Inventory Deep Integration
1. Expand stock voucher posting profiles to explicit journal templates per transaction kind.
2. Introduce AP/AR party accounts and tax account routing.
3. Add COGS and inventory depletion entries for sales flows.
4. Wrap inventory + accounting posting in atomic transaction/session patterns.

## Phase E: Navigation and ERP Information Architecture
1. Reorganize sidebar groups to requested ERP taxonomy while preserving existing routes.
2. Add examination submenu endpoints and pages without duplicating current modules.

## 8) Immediate Build Order (Next implementation sprint)

1. Migration + backup tooling (safe baseline).
2. Exam master entities (types/terms/schedule) with class-subject auto-load.
3. ResultEntry model + status workflow + audit events.
4. Result formula engine and final result card pipeline.
5. Accounting-inventory journal template hardening.

## 9) Non-Duplication Rules Applied

- Reuse existing models/services/routes where available.
- Add new collections only for missing domain concepts.
- Do not delete existing data or replace working modules.
- Keep backward-compatible adapters during transition.

## 10) Acceptance Criteria for Completion

Done only when:
- Existing modules remain visible and functional.
- Existing data is preserved.
- Exam schedule, result entry, term/cumulative logic, and publish flow are DB-driven.
- Inventory and accounting postings reconcile through auditable ledger entries.
- Final cards/transcripts support school and university grading patterns.
- End-to-end scenario tests pass for accounting and examination workflows.
