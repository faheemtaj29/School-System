MongoDB migration runner

Commands
- node scripts/migrations/run.js status
- node scripts/migrations/run.js up

NPM shortcuts (from package.json)
- npm run db:migrate:status
- npm run db:migrate

How it works
1. Loads MONGODB_URI from .env.local (or process env).
2. Reads migration files in this folder in filename order.
3. Stores applied migration IDs in collection _migrations.
4. Applies only pending migrations.

Migration file format
- Export id (string)
- Export optional description (string)
- Export async up(db) function

Example
module.exports = {
  id: "20260817_002_example",
  description: "Example migration",
  async up(db) {
    await db.collection("example").updateMany({}, { $set: { migrated: true } });
  },
};

Safety notes
- Write idempotent migrations whenever possible.
- Always run a backup first: npm run db:backup
- Never drop collections in the first implementation pass.
