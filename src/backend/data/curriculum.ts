/**
 * Default academic ladder — pre-nursery through postgraduate — with the
 * subject list of every class. Imported on demand from Classes → Curriculum
 * Library; safe to re-run because everything upserts on code / name.
 */

export type StageKey =
  | "pre-primary"
  | "primary"
  | "middle"
  | "secondary"
  | "intermediate"
  | "undergraduate"
  | "postgraduate";

export type CurriculumSubject = { code: string; name: string; credits: number; stage: StageKey };
export type CurriculumClass = {
  name: string;
  level: number;
  stream?: string;
  capacity: number;
  subjects: string[];
};
export type CurriculumStage = {
  key: StageKey;
  label: string;
  note: string;
  classes: CurriculumClass[];
};

const sub = (stage: StageKey) => (code: string, name: string, credits: number): CurriculumSubject => ({
  code,
  name,
  credits,
  stage,
});

const pre = sub("pre-primary");
const pri = sub("primary");
const mid = sub("middle");
const sec = sub("secondary");
const int = sub("intermediate");
const ug = sub("undergraduate");
const pg = sub("postgraduate");

/** Master subject list. `credits` = weekly periods at school, credit hours at college/university. */
export const CURRICULUM_SUBJECTS: CurriculumSubject[] = [
  pre("PRE-ENG", "English Readiness", 5),
  pre("PRE-URD", "Urdu Readiness", 5),
  pre("PRE-MTH", "Numbers & Counting", 5),
  pre("PRE-ISL", "Islamiat & Duas", 3),
  pre("PRE-GK", "General Knowledge", 2),
  pre("PRE-ART", "Art & Colouring", 2),
  pre("PRE-RHY", "Rhymes & Storytelling", 2),
  pre("PRE-PLY", "Play & Motor Skills", 3),

  pri("PRI-ENG", "English", 6),
  pri("PRI-URD", "Urdu", 6),
  pri("PRI-MTH", "Mathematics", 6),
  pri("PRI-SCI", "General Science", 4),
  pri("PRI-ISL", "Islamiat", 3),
  pri("PRI-QUR", "Quran Nazra", 3),
  pri("PRI-SST", "Social Studies", 3),
  pri("PRI-CMP", "Computer Basics", 2),
  pri("PRI-ART", "Art & Craft", 2),
  pri("PRI-PET", "Physical Education", 2),

  mid("MID-ENG", "English", 6),
  mid("MID-URD", "Urdu", 5),
  mid("MID-MTH", "Mathematics", 6),
  mid("MID-SCI", "General Science", 5),
  mid("MID-ISL", "Islamiat", 3),
  mid("MID-PST", "History & Geography of Pakistan", 3),
  mid("MID-CMP", "Computer Science", 3),
  mid("MID-ARB", "Arabic", 2),
  mid("MID-ART", "Art & Craft", 2),
  mid("MID-PET", "Physical Education", 2),

  sec("SEC-ENG", "English", 6),
  sec("SEC-URD", "Urdu", 5),
  sec("SEC-ISL", "Islamiat", 3),
  sec("SEC-PST", "Pakistan Studies", 3),
  sec("SEC-MTH", "Mathematics", 6),
  sec("SEC-PHY", "Physics", 5),
  sec("SEC-CHE", "Chemistry", 5),
  sec("SEC-BIO", "Biology", 5),
  sec("SEC-CSC", "Computer Science", 5),
  sec("SEC-GSC", "General Science", 4),
  sec("SEC-ECO", "Economics", 4),
  sec("SEC-CIV", "Civics", 4),
  sec("SEC-HIS", "History", 4),
  sec("SEC-GEO", "Geography", 4),
  sec("SEC-TQR", "Tarjuma-tul-Quran", 2),

  int("INT-ENG", "English", 4),
  int("INT-URD", "Urdu", 4),
  int("INT-ISL", "Islamic Studies", 2),
  int("INT-PST", "Pakistan Studies", 2),
  int("INT-PHY", "Physics", 5),
  int("INT-CHE", "Chemistry", 5),
  int("INT-BIO", "Biology", 5),
  int("INT-MTH", "Mathematics", 5),
  int("INT-CSC", "Computer Science", 5),
  int("INT-STA", "Statistics", 4),
  int("INT-ACC", "Principles of Accounting", 5),
  int("INT-ECO", "Economics", 4),
  int("INT-BUS", "Business Studies", 4),
  int("INT-COM", "Commerce & Banking", 4),
  int("INT-EDU", "Education", 4),
  int("INT-CIV", "Civics", 4),
  int("INT-ISH", "Islamic History", 4),
  int("INT-SOC", "Sociology", 4),
  int("INT-PSY", "Psychology", 4),

  ug("GEN-ENG101", "English Composition", 3),
  ug("GEN-ENG102", "Communication Skills", 3),
  ug("GEN-ISL101", "Islamic Studies", 2),
  ug("GEN-PST101", "Pakistan Studies", 2),
  ug("GEN-MTH101", "Calculus & Analytical Geometry", 3),
  ug("GEN-MTH102", "Discrete Structures", 3),
  ug("GEN-STA101", "Probability & Statistics", 3),
  ug("GEN-PHY101", "Applied Physics", 3),
  ug("GEN-ECO101", "Principles of Economics", 3),
  ug("GEN-PSY101", "Introduction to Psychology", 3),
  ug("GEN-SOC101", "Introduction to Sociology", 3),

  ug("CS-101", "Programming Fundamentals", 4),
  ug("CS-102", "Introduction to ICT", 3),
  ug("CS-103", "Object Oriented Programming", 4),
  ug("CS-104", "Digital Logic Design", 3),
  ug("CS-201", "Data Structures & Algorithms", 4),
  ug("CS-202", "Computer Organization & Assembly", 3),
  ug("CS-203", "Database Systems", 4),
  ug("CS-204", "Operating Systems", 3),
  ug("CS-205", "Software Engineering", 3),
  ug("CS-206", "Design & Analysis of Algorithms", 3),
  ug("CS-301", "Computer Networks", 3),
  ug("CS-302", "Artificial Intelligence", 3),
  ug("CS-303", "Web Technologies", 3),
  ug("CS-304", "Theory of Automata", 3),
  ug("CS-305", "Compiler Construction", 3),
  ug("CS-306", "Information Security", 3),
  ug("CS-307", "Mobile Application Development", 3),
  ug("CS-308", "Human Computer Interaction", 3),
  ug("CS-401", "Machine Learning", 3),
  ug("CS-402", "Cloud Computing", 3),
  ug("CS-403", "Final Year Project I", 3),
  ug("CS-404", "Final Year Project II", 3),
  ug("CS-405", "Professional Practices", 2),
  ug("CS-406", "Data Science", 3),

  ug("BA-101", "Introduction to Business", 3),
  ug("BA-102", "Principles of Management", 3),
  ug("BA-103", "Business Mathematics", 3),
  ug("BA-104", "Financial Accounting", 3),
  ug("BA-105", "Microeconomics", 3),
  ug("BA-106", "Business Communication", 3),
  ug("BA-201", "Macroeconomics", 3),
  ug("BA-202", "Cost Accounting", 3),
  ug("BA-203", "Principles of Marketing", 3),
  ug("BA-204", "Business Law", 3),
  ug("BA-205", "Financial Management", 3),
  ug("BA-206", "Human Resource Management", 3),
  ug("BA-207", "Organizational Behaviour", 3),
  ug("BA-301", "Marketing Management", 3),
  ug("BA-302", "Money & Banking", 3),
  ug("BA-303", "Entrepreneurship", 3),
  ug("BA-304", "Operations Management", 3),
  ug("BA-305", "Business Research Methods", 3),
  ug("BA-306", "Consumer Behaviour", 3),
  ug("BA-307", "Supply Chain Management", 3),
  ug("BA-401", "Strategic Management", 3),
  ug("BA-402", "International Business", 3),
  ug("BA-403", "Investment Analysis", 3),
  ug("BA-404", "Leadership & Change", 3),
  ug("BA-405", "Internship Report", 3),
  ug("BA-406", "Business Policy & Project", 3),

  ug("EN-101", "Introduction to Literature", 3),
  ug("EN-102", "Functional English", 3),
  ug("EN-103", "Phonetics & Phonology", 3),
  ug("EN-104", "Classical Poetry", 3),
  ug("EN-201", "Drama", 3),
  ug("EN-202", "The Novel", 3),
  ug("EN-203", "Introduction to Linguistics", 3),
  ug("EN-204", "American Literature", 3),
  ug("EN-205", "Literary Criticism", 3),
  ug("EN-206", "Modern Poetry", 3),
  ug("EN-301", "Postcolonial Literature", 3),
  ug("EN-302", "English Language Teaching", 3),
  ug("EN-303", "Research Methodology", 3),
  ug("EN-304", "Shakespeare Studies", 3),
  ug("EN-305", "World Literature in Translation", 3),
  ug("EN-306", "Discourse Analysis", 3),
  ug("EN-401", "Pakistani Literature in English", 3),
  ug("EN-402", "Research Thesis", 6),

  pg("MS-501", "Advanced Algorithms", 3),
  pg("MS-502", "Research Methods in Computing", 3),
  pg("MS-503", "Advanced Machine Learning", 3),
  pg("MS-504", "Distributed Systems", 3),
  pg("MS-505", "Advanced Database Systems", 3),
  pg("MS-506", "Deep Learning", 3),
  pg("MS-507", "MS Thesis I", 6),
  pg("MS-508", "MS Thesis II", 6),
  pg("MB-501", "Advanced Financial Management", 3),
  pg("MB-502", "Strategic Marketing", 3),
  pg("MB-503", "Corporate Governance", 3),
  pg("MB-504", "Managerial Economics", 3),
  pg("MB-505", "Business Analytics", 3),
  pg("MB-506", "Project Management", 3),
  pg("MB-507", "MBA Research Project", 6),
];

const SEC_CORE = ["SEC-ENG", "SEC-URD", "SEC-ISL", "SEC-PST", "SEC-TQR"];
const INT_CORE = ["INT-ENG", "INT-URD", "INT-ISL", "INT-PST"];

/** Secondary and intermediate run the same subjects across both years. */
const secondaryClasses = (): CurriculumClass[] =>
  [9, 10].flatMap((grade, i) => [
    {
      name: `Class ${grade} Science`,
      level: 12 + i,
      stream: "Science (Biology)",
      capacity: 45,
      subjects: [...SEC_CORE, "SEC-MTH", "SEC-PHY", "SEC-CHE", "SEC-BIO"],
    },
    {
      name: `Class ${grade} Computer`,
      level: 12 + i,
      stream: "Science (Computer)",
      capacity: 45,
      subjects: [...SEC_CORE, "SEC-MTH", "SEC-PHY", "SEC-CHE", "SEC-CSC"],
    },
    {
      name: `Class ${grade} Arts`,
      level: 12 + i,
      stream: "Humanities",
      capacity: 45,
      subjects: [...SEC_CORE, "SEC-GSC", "SEC-ECO", "SEC-CIV", "SEC-HIS", "SEC-GEO"],
    },
  ]);

const intermediateGroups: { label: string; stream: string; subjects: string[] }[] = [
  {
    label: "FSc Pre-Medical",
    stream: "Pre-Medical",
    subjects: [...INT_CORE, "INT-PHY", "INT-CHE", "INT-BIO"],
  },
  {
    label: "FSc Pre-Engineering",
    stream: "Pre-Engineering",
    subjects: [...INT_CORE, "INT-PHY", "INT-CHE", "INT-MTH"],
  },
  {
    label: "ICS",
    stream: "Computer Science",
    subjects: [...INT_CORE, "INT-MTH", "INT-CSC", "INT-PHY", "INT-STA"],
  },
  {
    label: "I.Com",
    stream: "Commerce",
    subjects: [...INT_CORE, "INT-ACC", "INT-ECO", "INT-BUS", "INT-COM", "INT-STA"],
  },
  {
    label: "FA General",
    stream: "Arts",
    subjects: [...INT_CORE, "INT-EDU", "INT-CIV", "INT-ISH", "INT-SOC", "INT-PSY"],
  },
];

const intermediateClasses = (): CurriculumClass[] =>
  intermediateGroups.flatMap((group) =>
    ["Part I", "Part II"].map((part, i) => ({
      name: `${group.label} ${part}`,
      level: 14 + i,
      stream: group.stream,
      capacity: 60,
      subjects: group.subjects,
    }))
  );

/** Degree programmes: eight semesters of core courses each. */
const programmes: { label: string; stream: string; semesters: string[][] }[] = [
  {
    label: "BSCS",
    stream: "BS Computer Science",
    semesters: [
      ["CS-101", "CS-102", "GEN-ENG101", "GEN-MTH101", "GEN-ISL101"],
      ["CS-103", "CS-104", "GEN-MTH102", "GEN-ENG102", "GEN-PST101"],
      ["CS-201", "CS-202", "GEN-STA101", "GEN-PHY101", "GEN-ECO101"],
      ["CS-203", "CS-204", "CS-205", "CS-206", "GEN-PSY101"],
      ["CS-301", "CS-302", "CS-303", "CS-304"],
      ["CS-305", "CS-306", "CS-307", "CS-308"],
      ["CS-401", "CS-402", "CS-403", "CS-406"],
      ["CS-404", "CS-405", "GEN-SOC101"],
    ],
  },
  {
    label: "BBA",
    stream: "BS Business Administration",
    semesters: [
      ["BA-101", "BA-102", "BA-103", "GEN-ENG101", "GEN-ISL101"],
      ["BA-104", "BA-105", "BA-106", "GEN-ENG102", "GEN-PST101"],
      ["BA-201", "BA-202", "BA-203", "BA-204", "GEN-STA101"],
      ["BA-205", "BA-206", "BA-207", "BA-305", "GEN-PSY101"],
      ["BA-301", "BA-302", "BA-303", "BA-304"],
      ["BA-306", "BA-307", "BA-403", "GEN-SOC101"],
      ["BA-401", "BA-402", "BA-404", "BA-405"],
      ["BA-406", "BA-403", "GEN-ECO101"],
    ],
  },
  {
    label: "BS English",
    stream: "BS English Literature",
    semesters: [
      ["EN-101", "EN-102", "GEN-ENG101", "GEN-ISL101", "GEN-SOC101"],
      ["EN-103", "EN-104", "GEN-ENG102", "GEN-PST101", "GEN-PSY101"],
      ["EN-201", "EN-202", "EN-203", "GEN-ECO101"],
      ["EN-204", "EN-205", "EN-206", "GEN-STA101"],
      ["EN-301", "EN-302", "EN-304"],
      ["EN-303", "EN-305", "EN-306"],
      ["EN-401", "EN-303", "EN-305"],
      ["EN-402", "EN-401"],
    ],
  },
];

const undergraduateClasses = (): CurriculumClass[] =>
  programmes.flatMap((programme) =>
    programme.semesters.map((subjects, i) => ({
      name: `${programme.label} Semester ${i + 1}`,
      level: 16 + i,
      stream: programme.stream,
      capacity: 50,
      subjects: [...new Set(subjects)],
    }))
  );

const postgraduateProgrammes: { label: string; stream: string; semesters: string[][] }[] = [
  {
    label: "MS Computer Science",
    stream: "MS Computer Science",
    semesters: [
      ["MS-501", "MS-502", "MS-504"],
      ["MS-503", "MS-505", "MS-506"],
      ["MS-507"],
      ["MS-508"],
    ],
  },
  {
    label: "MBA",
    stream: "Master of Business Administration",
    semesters: [
      ["MB-501", "MB-504", "MB-506"],
      ["MB-502", "MB-503", "MB-505"],
      ["MB-507", "MB-505"],
      ["MB-507", "MB-506"],
    ],
  },
];

const postgraduateClasses = (): CurriculumClass[] =>
  postgraduateProgrammes.flatMap((programme) =>
    programme.semesters.map((subjects, i) => ({
      name: `${programme.label} Semester ${i + 1}`,
      level: 24 + i,
      stream: programme.stream,
      capacity: 35,
      subjects: [...new Set(subjects)],
    }))
  );

export const CURRICULUM: CurriculumStage[] = [
  {
    key: "pre-primary",
    label: "Pre-Primary",
    note: "Pre-Nursery to Prep — readiness and play based learning",
    classes: [
      {
        name: "Pre-Nursery",
        level: 1,
        capacity: 25,
        subjects: ["PRE-ENG", "PRE-URD", "PRE-MTH", "PRE-RHY", "PRE-ART", "PRE-PLY"],
      },
      {
        name: "Nursery",
        level: 2,
        capacity: 25,
        subjects: ["PRE-ENG", "PRE-URD", "PRE-MTH", "PRE-ISL", "PRE-GK", "PRE-RHY", "PRE-ART", "PRE-PLY"],
      },
      {
        name: "Prep (KG)",
        level: 3,
        capacity: 30,
        subjects: ["PRE-ENG", "PRE-URD", "PRE-MTH", "PRE-ISL", "PRE-GK", "PRE-ART", "PRE-PLY"],
      },
    ],
  },
  {
    key: "primary",
    label: "Primary",
    note: "Class 1 to Class 5",
    classes: [1, 2, 3, 4, 5].map((grade) => ({
      name: `Class ${grade}`,
      level: 3 + grade,
      capacity: 40,
      subjects:
        grade <= 3
          ? ["PRI-ENG", "PRI-URD", "PRI-MTH", "PRI-SCI", "PRI-ISL", "PRI-QUR", "PRI-ART", "PRI-PET"]
          : [
              "PRI-ENG",
              "PRI-URD",
              "PRI-MTH",
              "PRI-SCI",
              "PRI-ISL",
              "PRI-QUR",
              "PRI-SST",
              "PRI-CMP",
              "PRI-ART",
              "PRI-PET",
            ],
    })),
  },
  {
    key: "middle",
    label: "Middle",
    note: "Class 6 to Class 8",
    classes: [6, 7, 8].map((grade) => ({
      name: `Class ${grade}`,
      level: 3 + grade,
      capacity: 40,
      subjects: [
        "MID-ENG",
        "MID-URD",
        "MID-MTH",
        "MID-SCI",
        "MID-ISL",
        "MID-PST",
        "MID-CMP",
        "MID-ARB",
        "MID-ART",
        "MID-PET",
      ],
    })),
  },
  {
    key: "secondary",
    label: "Secondary (Matric)",
    note: "Class 9 & 10 — Science, Computer and Arts groups",
    classes: secondaryClasses(),
  },
  {
    key: "intermediate",
    label: "Intermediate (College)",
    note: "FSc, ICS, I.Com and FA — Part I & II",
    classes: intermediateClasses(),
  },
  {
    key: "undergraduate",
    label: "Undergraduate (University)",
    note: "BSCS, BBA and BS English — eight semesters each",
    classes: undergraduateClasses(),
  },
  {
    key: "postgraduate",
    label: "Postgraduate",
    note: "MS Computer Science and MBA — four semesters each",
    classes: postgraduateClasses(),
  },
];

export const STAGE_LABELS: Record<StageKey, string> = {
  "pre-primary": "Pre-Primary",
  primary: "Primary",
  middle: "Middle",
  secondary: "Secondary (Matric)",
  intermediate: "Intermediate (College)",
  undergraduate: "Undergraduate",
  postgraduate: "Postgraduate",
};

/** Summary used by the Curriculum Library screen. */
export function curriculumSummary() {
  return CURRICULUM.map((stage) => {
    const codes = new Set(stage.classes.flatMap((c) => c.subjects));
    return {
      key: stage.key,
      label: stage.label,
      note: stage.note,
      classes: stage.classes.length,
      subjects: codes.size,
      sample: stage.classes.slice(0, 4).map((c) => c.name),
    };
  });
}
