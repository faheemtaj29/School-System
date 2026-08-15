# Project structure

```
School System/
├── .env.local                 # secrets (not committed)
├── package.json
├── src/
│   ├── app/                   # Next.js App Router (UI pages + API entry)
│   │   ├── (app)/             # logged-in pages (dashboard, students, …)
│   │   ├── api/               # thin HTTP routes → backend controllers
│   │   ├── login/             # public login page
│   │   └── setup/             # first admin setup
│   ├── backend/               # ★ ALL SERVER LOGIC (read README inside)
│   │   ├── config/            # env + MongoDB
│   │   ├── types/             # shared TS types / ServiceError
│   │   ├── lib/               # JWT, cookies, password, HTTP helpers
│   │   ├── models/            # Mongoose schemas
│   │   ├── validators/        # Zod input schemas
│   │   ├── services/          # business logic
│   │   └── controllers/       # HTTP handlers
│   ├── components/            # React UI
│   ├── lib/                   # frontend helpers + deprecated re-exports
│   ├── models/                # deprecated re-exports → backend/models
│   └── proxy.ts               # auth gate (redirect / protect routes)
└── public/
```

**Start here for backend:** [`src/backend/README.md`](./src/backend/README.md)
