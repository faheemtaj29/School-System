/*
 * Baseline migration marker.
 * Intentionally no-op: establishes migration history without altering data.
 */
module.exports = {
  id: "20260817_001_baseline",
  description: "Baseline marker for migration runner",
  async up(db) {
    void db;
    // no-op
  },
};
