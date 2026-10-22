/** Letter grade from a percentage — used on result cards, transcripts and marks entry. */
export function gradeOf(percent: number) {
  if (percent >= 80) return "A+";
  if (percent >= 70) return "A";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

/** 4.0 scale used for GPA / CGPA on result cards and transcripts. */
export function gpaPoints(percent: number) {
  if (percent >= 85) return 4.0;
  if (percent >= 80) return 3.7;
  if (percent >= 75) return 3.3;
  if (percent >= 70) return 3.0;
  if (percent >= 65) return 2.7;
  if (percent >= 60) return 2.3;
  if (percent >= 55) return 2.0;
  if (percent >= 50) return 1.7;
  if (percent >= 45) return 1.3;
  if (percent >= 40) return 1.0;
  return 0;
}

/** Short remark printed on result cards from the overall percentage. */
export function remarkOf(percent: number, passed: boolean) {
  if (!passed) return "Needs improvement — must clear failed subjects.";
  if (percent >= 90) return "Outstanding performance. Keep it up!";
  if (percent >= 80) return "Excellent work.";
  if (percent >= 70) return "Very good.";
  if (percent >= 60) return "Good — can do better.";
  if (percent >= 50) return "Satisfactory.";
  return "Passed — work harder.";
}
