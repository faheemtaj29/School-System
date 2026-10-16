/**
 * Drops the test database before an e2e run. Refuses any database whose name
 * does not end in "_test", so it cannot wipe real data by accident.
 *   MONGODB_URI=mongodb://localhost:27017/sabaq_test node scripts/e2e/reset-test-db.cjs
 */
const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI to the throwaway test database");
  process.exit(1);
}
(async () => {
  await mongoose.connect(uri);
  const name = mongoose.connection.db.databaseName;
  if (!name.endsWith("_test")) {
    console.error(`Refusing to drop "${name}": test database names must end in _test`);
    process.exit(1);
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`Dropped ${name}`);
})();
