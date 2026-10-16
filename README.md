# Sabaq — School Management System

Full school management app built with **Next.js (App Router)**, **React**, **Mongoose/MongoDB**, and **related/nested forms**.

## Features

- **Dashboard** with colorful KPIs, attendance trend chart, class-strength bars, fee ring
- Auth: login + first-time admin setup (JWT cookie)
- Academics: Students, Teachers, Classes, Subjects, Attendance, Exams
- Finance: Fee vouchers + Accounting ledger (income/expense)
- Ops: Inventory / store stock
- HR: Leave requests + Payroll / payslips
- Notices & Events
- Reports & Print (students, fees, attendance, exams, staff, finance, inventory)
- Settings (school profile + notification toggles)
- Related/nested forms throughout

## Stack

- Next.js 16 + React 19 + TypeScript
- Custom CSS design system in `src/app/globals.css` (jade/saffron palette, Spectral + Work Sans + Space Mono)
- MongoDB + Mongoose
- Zod validation
- jose (JWT) + bcryptjs

## Setup

1. Install [MongoDB](https://www.mongodb.com/try/download/community) locally, or use MongoDB Atlas.

2. Copy env file:

```bash
cp .env.local.example .env.local
```

3. Set `MONGODB_URI` and `JWT_SECRET` in `.env.local`.

4. Install & run:

```bash
npm install
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

6. Go to **Initial setup** and create the first admin (example):
   - Email: `admin@school.local`
   - Password: `admin123`

## Suggested data order

1. Subjects  
2. Classes  
3. Teachers (assign subjects/classes)  
4. Students (assign class)  
5. Attendance / Exams / Fees  

## Related forms (Mongoose populate)

| Form | Related fields |
|------|----------------|
| Student | `classId`, parent contact block |
| Teacher | multi-select `subjects`, `classes` |
| Class | optional `classTeacher` |
| Attendance | `classId` + nested `records[]` |
| Exam | `classId`, `subjectId`, `teacherId` + nested `results[]` |
| Fee | `studentId` |

## Backend layout (for developers)

All server code is under **`src/backend/`** in clear layers:

| Folder | Purpose |
|--------|---------|
| `config/` | Env + MongoDB connection |
| `models/` | Mongoose schemas |
| `validators/` | Zod request schemas |
| `services/` | Business logic / DB queries |
| `controllers/` | HTTP handlers |
| `lib/` | JWT, cookies, passwords, JSON helpers |

`src/app/api/**/route.ts` files are thin — they only call controllers.

- Full map: [`STRUCTURE.md`](./STRUCTURE.md)
- Backend guide: [`src/backend/README.md`](./src/backend/README.md)
- API list: [`src/app/api/README.md`](./src/app/api/README.md)

## API

All under `/api/*` — requires auth cookie except `/api/auth/login` and setup.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
