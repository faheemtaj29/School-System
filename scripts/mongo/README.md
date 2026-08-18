MongoDB helper scripts

Run these scripts to seed the development MongoDB with required platform data.

Usage examples:

```powershell
# seed Chart of Accounts
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_coa.js

# seed default workflows and custom fields
MONGO_URL="mongodb://localhost:27017/school-system" INSTITUTION_CODE=MAIN node scripts/mongo/seed_workflows.js
```

Notes:
- These scripts are minimal, idempotent, and safe for development use.
- Use the `MONGO_URL` env var to point to your MongoDB instance.
- For production migrations use a proper migration tool (migrate-mongo or custom scripts tied to releases).

Project DB safety workflow (recommended)

```powershell
# 1) backup current database snapshot
npm run db:backup

# 2) inspect migration status
npm run db:migrate:status

# 3) apply pending migrations
npm run db:migrate
```

Migration runner files live in `scripts/migrations/`.
