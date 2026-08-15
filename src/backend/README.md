# Backend Guide — Sabaq School System

This folder is the **server-side** of the app. Frontend UI lives in `src/app` and `src/components`.

## Folder map (read top → bottom)

```
src/backend/
├── README.md              ← you are here
├── index.ts               ← public exports overview
├── config/                ← env + database connection
├── types/                 ← shared TypeScript types
├── lib/                   ← low-level helpers (HTTP, JWT, passwords)
├── models/                ← Mongoose schemas (MongoDB collections)
├── validators/            ← Zod request validation schemas
├── services/              ← business logic (DB queries, rules)
└── controllers/           ← HTTP handlers (parse → validate → service → JSON)
```

## Request flow

```
Browser / Frontend
      │
      ▼
src/app/api/**/route.ts     ← thin Next.js route (1–3 lines)
      │
      ▼
controllers/*               ← auth check, parse body, map status codes
      │
      ▼
validators/*                ← Zod schemas (reject bad input early)
      │
      ▼
services/*                  ← create / update / list / delete + populate
      │
      ▼
models/*                    ← Mongoose documents
      │
      ▼
MongoDB
```

## Who edits what?

| Task | Edit here |
|------|-----------|
| Add a MongoDB field | `models/` |
| Change validation rules | `validators/` |
| Change business rules / queries | `services/` |
| Change API status / response shape | `controllers/` |
| Add a new HTTP endpoint | `controllers/` + thin `src/app/api/.../route.ts` |
| DB connection / secrets | `config/` |

## Modules

| Module | Model | Validator | Service | Controller | API |
|--------|-------|-----------|---------|------------|-----|
| Auth | User | auth | auth | auth | `/api/auth/*` |
| Students | Student | student | student | student | `/api/students` |
| Teachers | Teacher | teacher | teacher | teacher | `/api/teachers` |
| Classes | Class | class | class | class | `/api/classes` |
| Subjects | Subject | subject | subject | subject | `/api/subjects` |
| Attendance | Attendance | attendance | attendance | attendance | `/api/attendance` |
| Exams | Exam | exam | exam | exam | `/api/exams` |
| Fees | Fee | fee | fee | fee | `/api/fees` |
| Dashboard | (aggregate) | — | dashboard | dashboard | `/api/dashboard` |

## Import alias

```ts
import { studentController } from "@/backend/controllers/student.controller";
import { Student } from "@/backend/models";
import { dbConnect } from "@/backend/config/database";
```

## Env vars (see `.env.local`)

- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — session token secret
