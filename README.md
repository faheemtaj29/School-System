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

## Marketplace: cars, bikes, shop & public ads

| Who | Where | What |
|-----|-------|------|
| Staff | `/dealership` | Car & bike stock, lead CRM, deal desk, financing, **Public Ads** review tab |
| Staff | `/ecommerce` | Online shop: orders (confirm → dispatch → deliver), product listings with photos, shop settings |
| Public | `/cars`, `/bikes` | Search dealer stock **and** approved private ads (filter dealer / private) |
| Public | `/shop` | Car & bike accessories, oils, parts; cart, cash-on-delivery checkout, `/shop/track` |
| Public | `/post-ad`, `/account` | Seller accounts (mobile + password), post/edit/renew ads, read buyer messages, see shop orders |

How it fits together:

- **Shop products are inventory items.** List an item in *Online Shop → Products*; price and stock stay in
  Inventory. Confirming a web order posts a normal **sales stock voucher** (stock goes down, sale is booked
  in Accounting); cancelling voids it; a return posts a sales-return voucher.
- **Public ads** live in their own collection, never touch dealership accounting, and go live after a
  staff member approves them (switchable in *Shop Settings*). They expire after 30 days.
- **Photos** upload to `public/uploads/images/…`. On serverless/ephemeral hosting, switch
  `src/backend/lib/imageUpload.ts` to object storage (S3/R2).
- **Database:** MongoDB creates every collection automatically on first save — no migrations to run.
  New collections: `vehicles`, `dealercustomers`, `dealerdeals`, `classifiedads`, `marketmembers`,
  `shoporders`, `shopsettings` (shop fields are added to `inventoryitems`).

## Checking what was built

1. Run the app (`npm run dev`), open `/setup`, create the admin, then:
   - *Inventory* → add an item with a sale price and opening stock.
   - *Online Shop → Products* → **List in shop**, add a photo, tick *Live*.
   - Open `/shop` in another browser, add to cart, place a cash-on-delivery order.
   - *Online Shop → Orders* → **Confirm** (watch stock drop in Inventory and the sale appear in
     Accounting) → **Dispatch** → **Delivered**.
   - *Dealership → Inventory* → add a **Motorbike**, tick *Publish*; it appears on `/bikes`.
   - On `/post-ad`, create a seller account and post an ad → approve it in *Dealership → Public Ads* →
     it appears on `/cars` or `/bikes` marked *Private*.
   - `/dashboard` shows the Dealership and Online Shop & Ads cards.
2. Automated end-to-end check (79 assertions: stock, accounting vouchers, permissions, security):

```bash
# terminal 1 — a throwaway database whose name ends in _test
MONGODB_URI=mongodb://localhost:27017/sabaq_test npm run test:e2e:reset
MONGODB_URI=mongodb://localhost:27017/sabaq_test JWT_SECRET=dev-secret-0123456789abcdef npm run dev
# terminal 2
npm run test:e2e
```

3. Look at the data with MongoDB Compass or `mongosh` → `use sabaq` → `show collections`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:e2e        # marketplace end-to-end check (needs a running app on a _test database)
npm run test:e2e:reset  # drops the _test database only
```
