MongoDB helper scripts

Run these scripts to seed the development MongoDB with required platform data.

Usage examples:

```powershell
# seed Chart of Accounts
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_coa.js

# seed default workflows and custom fields
MONGO_URL="mongodb://localhost:27017/school-system" INSTITUTION_CODE=MAIN node scripts/mongo/seed_workflows.js

# ensure settings and institution
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_settings.js
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_institution.js

# create an admin user
ADMIN_EMAIL=admin@local ADMIN_PASS=password MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_admin.js

# seed sample courses & classes
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_sample_courses.js

# seed demo students
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_students.js

# seed full demo data across modules (fees, exams, attendance, notices, inventory, accounting)
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_demo_data.js

# run all seeds in order
MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_all.js
```

Notes:
- These scripts are minimal, idempotent, and safe for development use.
- `seed_demo_data.js` gives a complete test playground for major modules.
- Use the `MONGO_URL` env var to point to your MongoDB instance.
- For production migrations use a proper migration tool (migrate-mongo or custom scripts tied to releases).
