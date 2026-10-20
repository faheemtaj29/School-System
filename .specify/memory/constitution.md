# School-System Constitution

## Core Principles

### I. TypeScript Strict Correctness (NON-NEGOTIABLE)
TypeScript strict mode is always on. No implicit `any`. Every function parameter and return value must be typed. Pre-existing TS errors in unrelated files may be left as-is, but new code must pass `tsc --noEmit` clean. Never use `@ts-ignore` or `as any` to silence errors — fix the root cause.

### II. Service-Layer Architecture (NON-NEGOTIABLE)
All database calls go through the service layer (`src/backend/services/`). API route handlers call services only — no Mongoose queries in route files. Services return plain view objects (never Mongoose documents). Use `toView()` or equivalent serializer helpers. Service errors use the `ServiceError` class with a code and message; API routes call `fromServiceError()` to respond.

### III. Security & Privacy (NON-NEGOTIABLE)
- CNIC / ID card numbers: AES-256-GCM encrypted at rest. Admin-only reveal. Audit-logged on every read. Never appear in public-facing pages or APIs.
- No student/staff photos served without authentication.
- `requireAuth(roles?)` called at the top of every API route handler.
- No secrets, tokens, or credentials in source code or committed files.

### IV. Language — English or Pure Urdu Only
All UI text, labels, comments, and error messages must be in English or pure Urdu (Nastaliq script). Hindi words written in Urdu script are not acceptable. When in doubt, use English.

### V. Minimal, Purposeful Code
No features beyond what is explicitly requested. No speculative abstractions. No backwards-compatibility shims for code that no longer exists. Three similar lines of code is better than a premature abstraction. Comments only where the WHY is non-obvious — never explain WHAT the code does.

### VI. Next.js 16 App Router Conventions
- `params` and `searchParams` are Promises in Next.js 16 — always `await` them.
- Server components for data fetching; client components (`"use client"`) for interactivity only.
- Use `next/font/local` with bundled `.woff2` files — never `next/font/google` (network unavailable in cloud containers).
- Use `next/image` with `fill` for responsive images; parent must have `position: relative; overflow: hidden`.

## Technology Stack

- **Framework**: Next.js 16.3.1, React 19, TypeScript 5 (strict)
- **Database**: MongoDB via Mongoose 9 — `populate().lean()` pattern; always serialize with `toView()`
- **Auth**: Session-based via `requireAuth()` from `@/backend/lib/http`
- **Styling**: Global CSS utility classes (`.btn`, `.form-input`, `.page-wrap`, `.modal-box`, etc.) — no Tailwind, no CSS modules unless pre-existing
- **Fonts**: Spectral (display), Work Sans (sans), Space Mono (mono), Noto Nastaliq Urdu — all bundled locally

## Development Workflow

- Branch: always `claude/cool-cray-m5533z` for this session's work
- Commit messages: descriptive, present tense, with `Co-Authored-By` and `Claude-Session` footer lines
- Never create a pull request unless explicitly asked
- Never push to a branch other than the designated one without explicit permission
- Run `tsc --noEmit` before committing; only pre-existing errors are acceptable

## Governance

This constitution supersedes all other practices. Any deviation requires explicit user approval. SpecKit workflow: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
