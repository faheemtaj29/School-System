# Gap Actions & Implementation Roadmap

This file lists the missing gaps identified during the architecture review and a prioritized action plan to close them with minimal duplication. Each action is expressed as a small, implementable task so we can work module-by-module.

Priority order (initial sprint)
1. Core SIS + Admissions MVP
   - Ensure `Student`, `Admission`, `Enrollment`, `Course`, `Branch` models are consistent.
   - Wire `Admission` into the `workflow` engine for application approvals.
   - Add APIs for application submission, status, and admin review.
2. Fees + Accounting core
   - Verify `Fee` and `LedgerEntry` models; implement fee invoice creation + ledger posting.
   - Implement basic receipts and outstanding balance API.
3. Authentication, Roles & RBAC
   - Ensure `User` model and roles map to permissions; add role-based middleware for APIs.
4. Workflow engine hardening
   - Persist workflow instances (use `WorkflowInstance` model), add step executors and notifications.
5. Custom fields & dynamic forms
   - Expose `CustomField` definitions API and attach JSONB payload storage for entity custom data.
6. Module loader + registration
   - Register existing modules with `moduleLoader` and initialize on app start (or at first DB connect).
7. Background jobs & notifications
   - Add job queue (Bull + Redis) scaffold and a notification service for emails/SMS.
8. Reporting / BI pipeline (event stream)
   - Add an event emitter for domain events; create ETL plan for OLAP store.

Lower priority / later sprints
- LMS features (content, assignments, quizzes)
- Timetable & automatic generator
- Payroll, Tax rules, Payslips
- Inventory, Library, Transport, Hostel modules (plug into platform core)
- AI Layer microservices

Concrete first commit tasks (I'll implement next)
- Create `ARCHITECTURE/GAP_ACTIONS.md` (this file).
- Wire `Admission` model to `workflowEngine` by adding a small service which starts a workflow when an admission is created. (non-breaking, uses existing models)

If this looks good I will implement the admission → workflow wiring as the next PR/change.
