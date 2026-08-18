/**
 * Page route access by role. Used by proxy + documentation of the multi-portal map.
 */
export const ADMIN_PAGES = [
  "/teachers",
  "/staff",
  "/website",
  "/settings",
  "/accounting",
];

/** Finance / ops — admin + campus staff */
export const OPS_PAGES = ["/fees", "/inventory", "/hr", "/campus", "/approvals"];

/** Teaching academics — admin + teacher */
export const ACADEMIC_PAGES = [
  "/students",
  "/classes",
  "/subjects",
  "/attendance",
  "/exams",
  "/reports",
  "/campus",
  "/approvals",
];

/** Everyone signed in */
export const SHARED_PAGES = ["/dashboard", "/distance-learning", "/notices"];

export function canOpenPage(role: string, pathname: string) {
  const normalizedRole = (role || "").toLowerCase();
  const hit = (paths: string[]) =>
    paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (hit(SHARED_PAGES)) return true;
  if (normalizedRole === "admin") return true;

  if (normalizedRole === "teacher") {
    if (hit(ACADEMIC_PAGES)) return true;
    if (pathname === "/hr" || pathname.startsWith("/hr/")) return true;
    return false;
  }

  if (normalizedRole === "staff") {
    if (hit(OPS_PAGES.filter((p) => p !== "/hr"))) return true;
    if (pathname === "/fees" || pathname.startsWith("/fees/")) return true;
    if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return true;
    if (pathname === "/approvals" || pathname.startsWith("/approvals/")) return true;
    return false;
  }

  if (normalizedRole === "student" || normalizedRole === "parent") {
    if (pathname === "/fees" || pathname.startsWith("/fees/")) return true;
    if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
    return false;
  }

  return false;
}
