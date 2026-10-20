# School-System Constitution

## Core Principles

### I. TypeScript Strict Correctness (NON-NEGOTIABLE)
TypeScript strict mode MUST always be on. Implicit `any` is forbidden. Every function
parameter and return value MUST be explicitly typed. New code MUST pass `tsc --noEmit`
with zero new errors. Pre-existing errors in unrelated files MAY be left as-is, but code
introduced in the same commit MUST be clean. `@ts-ignore` and `as any` MUST NOT be used
to suppress errors; fix the root cause.

### II. Service-Layer Architecture (NON-NEGOTIABLE)
All database access MUST go through the service layer (`src/backend/services/`). API route
handlers MUST call services only — Mongoose queries MUST NOT appear in route files. Services
MUST return plain, serialised view objects via `toView()` or equivalent (never raw Mongoose
documents). Errors MUST use the `ServiceError` class; routes MUST call `fromServiceError()`
to respond. `requireAuth(roles?)` MUST be called at the top of every API route handler.

### III. Security & Privacy (NON-NEGOTIABLE)
- CNIC / ID card numbers MUST be stored AES-256-GCM encrypted at rest.
- CNIC reveal MUST be admin-only and MUST be audit-logged on every access.
- CNIC numbers MUST NOT appear in public-facing pages, API responses, or logs.
- Student and staff photos MUST NOT be served without authentication.
- Secrets, tokens, and credentials MUST NOT be committed to source code.
- Every non-public API route MUST call `requireAuth(roles?)`.

### IV. Language — English or Pure Urdu Only (NON-NEGOTIABLE)
All UI text, labels, error messages, and code comments MUST be written in English or pure
Urdu (Nastaliq script). Hindi words written in Urdu script MUST NOT be used. When in doubt,
use English.

### V. Minimal, Purposeful Code (NON-NEGOTIABLE)
Features MUST NOT be added beyond what is explicitly requested (YAGNI). Speculative
abstractions are forbidden. Backwards-compatibility shims for removed code MUST NOT be
introduced. Three similar lines of code is preferable to a premature abstraction. Comments
MUST only explain WHY something non-obvious is done — explaining WHAT the code does is
forbidden; well-named identifiers do that already.

### VI. Next.js 16 App Router Conventions
- `params` and `searchParams` MUST be `await`-ed (they are Promises in Next.js 16).
- Fonts MUST use `next/font/local` with bundled `.woff2` files — `next/font/google` is
  forbidden (network unavailable in cloud containers).
- `next/image` with `fill` MUST have a parent with `position: relative; overflow: hidden`
  and an explicit height or aspect-ratio.
- Server components MUST be used for data fetching; `"use client"` MUST only be added
  where interactivity requires it.

## Technology Stack

- **Framework**: Next.js 16.3.1, React 19, TypeScript 5 (strict)
- **Database**: MongoDB via Mongoose 9 — `populate().lean()` pattern; MUST serialise
  with `toView()` before leaving the service layer
- **Auth**: Session-based via `requireAuth()` from `@/backend/lib/http`
- **Styling**: Global CSS utility classes in `src/app/globals.css` (`.btn`, `.form-input`,
  `.page-wrap`, `.modal-box`, etc.) — no Tailwind, no CSS Modules unless pre-existing
- **Fonts**: Spectral (display), Work Sans (sans), Space Mono (mono),
  Noto Nastaliq Urdu — all bundled as local `.woff2` files in `src/app/fonts/`
- **School scope only**: No marketplace, dealership, or car/bike code belongs here

## Development Workflow

- **Branch**: `claude/cool-cray-m5533z` for all work in this session
- **Commit messages**: descriptive, present tense; MUST end with `Co-Authored-By` and
  `Claude-Session` attribution footer lines
- **Pull requests**: MUST NOT be created unless explicitly requested by the user
- **Pre-commit gate**: `tsc --noEmit` MUST pass (zero new errors) before every commit
- **SpecKit workflow**: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`; use `/speckit-clarify` and `/speckit-analyze` to de-risk before
  planning when requirements are ambiguous

## Governance

This constitution supersedes all other practices. Any deviation from a NON-NEGOTIABLE
principle requires explicit written approval from the project owner before implementation.
Amendments MUST follow semantic versioning (MAJOR for principle removals/redefinitions,
MINOR for additions, PATCH for clarifications). All SpecKit commands read this file at
runtime — keep it current. Complexity MUST be justified against a real requirement; if no
requirement exists, the code MUST NOT exist.

**Version**: 1.1.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
