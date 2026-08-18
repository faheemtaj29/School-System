/*
 * Seed baseline exam type master records.
 * Idempotent: upserts by institutionCode + key.
 */
module.exports = {
  id: "20260817_002_seed_exam_types",
  description: "Seed default exam type master rows",
  async up(db) {
    const col = db.collection("examtypemasters");
    const now = new Date();
    const rows = [
      {
        key: "FIRST_TERM",
        name: "First Term Examination",
        category: "school",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "MID_TERM",
        name: "Mid Term Examination",
        category: "school",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "SECOND_TERM",
        name: "Second Term Examination",
        category: "school",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "FINAL_TERM",
        name: "Final Examination",
        category: "school",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "SEMESTER_1",
        name: "Semester 1",
        category: "college",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "SEMESTER_2",
        name: "Semester 2",
        category: "college",
        defaultMaxMarks: 100,
        defaultPassingMarks: 40,
      },
      {
        key: "UNIVERSITY_MIDTERM",
        name: "University Midterm",
        category: "university",
        defaultMaxMarks: 100,
        defaultPassingMarks: 50,
      },
      {
        key: "UNIVERSITY_FINAL",
        name: "University Final",
        category: "university",
        defaultMaxMarks: 100,
        defaultPassingMarks: 50,
      },
    ];

    for (const row of rows) {
      await col.updateOne(
        { institutionCode: "MAIN", key: row.key },
        {
          $set: {
            name: row.name,
            category: row.category,
            defaultMaxMarks: row.defaultMaxMarks,
            defaultPassingMarks: row.defaultPassingMarks,
            isActive: true,
            updatedAt: now,
          },
          $setOnInsert: {
            institutionCode: "MAIN",
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }
  },
};
