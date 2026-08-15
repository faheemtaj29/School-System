/**
 * Default project-based & distance-learning course outlines.
 * Built for classroom + online delivery: weekly modules, labs and
 * tangible projects (robotics, coding, design thinking).
 */

export type OutlineModule = {
  week: number;
  title: string;
  type: "lecture" | "lab" | "project" | "assessment";
  description: string;
  deliverable?: string;
};

export type ProjectCourseTemplate = {
  code: string;
  title: string;
  description: string;
  mode: "online" | "hybrid" | "distance";
  level: "certificate" | "diploma" | "short" | "degree";
  durationWeeks: number;
  fee: number;
  maxSeats: number;
  outline: OutlineModule[];
};

export const PROJECT_COURSE_TEMPLATES: ProjectCourseTemplate[] = [
  {
    code: "ROB-101",
    title: "Build Your First Robot",
    description:
      "Hands-on robotics for beginners — assemble a wheeled robot, wire sensors and write simple control code.",
    mode: "hybrid",
    level: "short",
    durationWeeks: 8,
    fee: 15000,
    maxSeats: 24,
    outline: [
      {
        week: 1,
        title: "Robotics & safety orientation",
        type: "lecture",
        description: "Parts of a robot, tools, lab rules and project goals.",
      },
      {
        week: 2,
        title: "Chassis, motors & power",
        type: "lab",
        description: "Assemble frame, mount motors and battery pack.",
        deliverable: "Working chassis photo",
      },
      {
        week: 3,
        title: "Sensors: IR & ultrasonic",
        type: "lab",
        description: "Wire sensors and read values on serial monitor.",
      },
      {
        week: 4,
        title: "Microcontroller basics",
        type: "lecture",
        description: "Arduino/ESP pin map, digital vs analog I/O.",
      },
      {
        week: 5,
        title: "Line-following logic",
        type: "project",
        description: "Code a simple line-follower algorithm.",
        deliverable: "Line-follow demo video",
      },
      {
        week: 6,
        title: "Obstacle avoidance",
        type: "project",
        description: "Combine ultrasonic sensing with motor control.",
      },
      {
        week: 7,
        title: "Polish & documentation",
        type: "lab",
        description: "Improve reliability and write a short project report.",
        deliverable: "1-page project report",
      },
      {
        week: 8,
        title: "Showcase & assessment",
        type: "assessment",
        description: "Live demo, Q&A and certificate criteria.",
        deliverable: "Final robot presentation",
      },
    ],
  },
  {
    code: "IOT-201",
    title: "IoT Smart Classroom Kit",
    description:
      "Connect sensors to the cloud — temperature, attendance badge and a simple dashboard for school use.",
    mode: "hybrid",
    level: "certificate",
    durationWeeks: 10,
    fee: 22000,
    maxSeats: 20,
    outline: [
      {
        week: 1,
        title: "What is IoT in education?",
        type: "lecture",
        description: "Use cases: attendance, labs, energy and safety.",
      },
      {
        week: 2,
        title: "Wi-Fi board setup",
        type: "lab",
        description: "Flash firmware and join school Wi-Fi.",
      },
      {
        week: 3,
        title: "Environmental sensors",
        type: "lab",
        description: "Read DHT/temperature and log locally.",
      },
      {
        week: 4,
        title: "Cloud messaging",
        type: "lecture",
        description: "MQTT/HTTP basics and secure API keys.",
      },
      {
        week: 5,
        title: "Live sensor dashboard",
        type: "project",
        description: "Publish readings to a simple web chart.",
        deliverable: "Dashboard URL or screenshot",
      },
      {
        week: 6,
        title: "RFID / QR attendance idea",
        type: "project",
        description: "Prototype a check-in flow for classmates.",
      },
      {
        week: 7,
        title: "Alerts & thresholds",
        type: "lab",
        description: "Send a notification when temperature exceeds a limit.",
      },
      {
        week: 8,
        title: "Ethics & data privacy",
        type: "lecture",
        description: "Student data, consent and school policy.",
      },
      {
        week: 9,
        title: "Integration week",
        type: "project",
        description: "Combine sensors + attendance into one kit story.",
        deliverable: "Kit demo + short write-up",
      },
      {
        week: 10,
        title: "Final review",
        type: "assessment",
        description: "Rubric-based presentation to peers/teachers.",
      },
    ],
  },
  {
    code: "PY-101",
    title: "Python for Problem Solving",
    description:
      "Learn Python through mini-projects: calculators, quizzes, data plots and a final student utility app.",
    mode: "online",
    level: "certificate",
    durationWeeks: 8,
    fee: 12000,
    maxSeats: 40,
    outline: [
      {
        week: 1,
        title: "Setup & first programs",
        type: "lecture",
        description: "IDE, print, variables and input.",
      },
      {
        week: 2,
        title: "Decisions & loops",
        type: "lab",
        description: "if/else, for/while with classroom examples.",
      },
      {
        week: 3,
        title: "Lists & dictionaries",
        type: "lab",
        description: "Store marks and look up students.",
      },
      {
        week: 4,
        title: "Functions & modules",
        type: "lecture",
        description: "Reusable code and importing libraries.",
      },
      {
        week: 5,
        title: "Mini quiz game",
        type: "project",
        description: "Build an MCQ quiz that scores itself.",
        deliverable: "Quiz source file",
      },
      {
        week: 6,
        title: "Files & simple data",
        type: "lab",
        description: "Read/write CSV of attendance or fees.",
      },
      {
        week: 7,
        title: "Student utility app",
        type: "project",
        description: "Marks average, grade letter and report printout.",
        deliverable: "Utility app + sample output",
      },
      {
        week: 8,
        title: "Code review & certificate",
        type: "assessment",
        description: "Peer review checklist and final viva.",
      },
    ],
  },
  {
    code: "WD-101",
    title: "Web Design Studio",
    description:
      "Design and publish a school club website — HTML/CSS layout, accessibility and a small interactive page.",
    mode: "hybrid",
    level: "short",
    durationWeeks: 6,
    fee: 10000,
    maxSeats: 30,
    outline: [
      {
        week: 1,
        title: "Design brief & wireframes",
        type: "lecture",
        description: "Audience, content blocks and page structure.",
        deliverable: "Paper or digital wireframe",
      },
      {
        week: 2,
        title: "HTML structure",
        type: "lab",
        description: "Semantic tags, lists, images and links.",
      },
      {
        week: 3,
        title: "CSS layout & branding",
        type: "lab",
        description: "Colours, typography and responsive basics.",
      },
      {
        week: 4,
        title: "Accessibility & forms",
        type: "lecture",
        description: "Contrast, alt text and a contact form.",
      },
      {
        week: 5,
        title: "Club site project",
        type: "project",
        description: "Home + about + events pages for a school club.",
        deliverable: "Deployed or zipped site",
      },
      {
        week: 6,
        title: "Critique & polish",
        type: "assessment",
        description: "Peer feedback and final submission.",
      },
    ],
  },
  {
    code: "DT-101",
    title: "Design Thinking Capstone",
    description:
      "Human-centred problem solving for campus challenges — research, prototype and pitch a student-led solution.",
    mode: "distance",
    level: "diploma",
    durationWeeks: 12,
    fee: 18000,
    maxSeats: 28,
    outline: [
      {
        week: 1,
        title: "Empathy & problem framing",
        type: "lecture",
        description: "Interview techniques and problem statements.",
      },
      {
        week: 2,
        title: "Field research",
        type: "lab",
        description: "Collect observations from campus stakeholders.",
        deliverable: "Research notes",
      },
      {
        week: 3,
        title: "Insight synthesis",
        type: "lecture",
        description: "Affinity maps and how-might-we questions.",
      },
      {
        week: 4,
        title: "Ideation sprint",
        type: "lab",
        description: "Brainstorm and shortlist solutions.",
      },
      {
        week: 5,
        title: "Low-fi prototype",
        type: "project",
        description: "Paper/digital prototype of the chosen idea.",
        deliverable: "Prototype photos",
      },
      {
        week: 6,
        title: "User testing",
        type: "lab",
        description: "Test with 3–5 users and capture feedback.",
      },
      {
        week: 7,
        title: "Iterate",
        type: "project",
        description: "Improve the prototype from test findings.",
      },
      {
        week: 8,
        title: "Impact & feasibility",
        type: "lecture",
        description: "Cost, stakeholders and school constraints.",
      },
      {
        week: 9,
        title: "Pitch deck",
        type: "project",
        description: "Story, evidence and ask.",
        deliverable: "5-slide pitch",
      },
      {
        week: 10,
        title: "Mentor clinics",
        type: "lab",
        description: "Teacher/industry feedback sessions.",
      },
      {
        week: 11,
        title: "Final build",
        type: "project",
        description: "Polish prototype and documentation pack.",
      },
      {
        week: 12,
        title: "Capstone showcase",
        type: "assessment",
        description: "Public pitch and graded rubric.",
        deliverable: "Final showcase pack",
      },
    ],
  },
  {
    code: "STEM-301",
    title: "STEM Maker Lab",
    description:
      "Cross-disciplinary maker course — electronics, simple mechanics and documentation for science fair projects.",
    mode: "hybrid",
    level: "certificate",
    durationWeeks: 9,
    fee: 16000,
    maxSeats: 22,
    outline: [
      {
        week: 1,
        title: "Maker mindset",
        type: "lecture",
        description: "Safety, tools and choosing a fair theme.",
      },
      {
        week: 2,
        title: "Circuits & measurement",
        type: "lab",
        description: "Multimeter, LEDs and series/parallel.",
      },
      {
        week: 3,
        title: "Mechanical basics",
        type: "lab",
        description: "Levers, gears and cardboard prototyping.",
      },
      {
        week: 4,
        title: "Proposal & BOM",
        type: "project",
        description: "Write a short proposal and bill of materials.",
        deliverable: "Project proposal",
      },
      {
        week: 5,
        title: "Build sprint 1",
        type: "project",
        description: "Core mechanism or circuit working.",
      },
      {
        week: 6,
        title: "Build sprint 2",
        type: "project",
        description: "Integrate parts and fix failures.",
      },
      {
        week: 7,
        title: "Data & evidence",
        type: "lab",
        description: "Collect measurements that prove the idea works.",
      },
      {
        week: 8,
        title: "Poster & demo script",
        type: "lecture",
        description: "Science-fair communication skills.",
        deliverable: "Poster draft",
      },
      {
        week: 9,
        title: "Maker exhibition",
        type: "assessment",
        description: "Live booth demo with peer scoring.",
      },
    ],
  },
];
