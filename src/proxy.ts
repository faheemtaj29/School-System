import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/backend/lib/session";
import { canOpenPage } from "@/lib/access";

/** Public marketing website + auth screens. */
const publicPaths = [
  "/",
  "/login",
  "/setup",
  "/courses",
  "/admissions",
  "/about",
  "/contact",
  "/cars",
  "/bikes",
  "/sell-car",
  "/shop",
  "/post-ad",
  "/account",
];

/** Public read/submit endpoints for the website. */
const publicApi = ["/api/auth", "/api/site"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    publicApi.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/uploads/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isPublic = publicPaths.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session && (pathname === "/login" || pathname === "/setup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Public marketplace pages stay viewable for signed-in staff; only "/" keeps
  // sending staff to their dashboard.
  const publicForStaff = isPublic && pathname !== "/";
  if (session && !pathname.startsWith("/api/") && !publicForStaff && !canOpenPage(session.role, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
