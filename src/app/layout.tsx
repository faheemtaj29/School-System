import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { settingsService } from "@/backend/services/settings.service";
import { themeCss } from "@/lib/theme";
import "./globals.css";

/** Headings. */
const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

/** Text and numbers (tabular figures); --font-mono points here too, see globals.css. */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Tab title, print header and icon come from the school's own name and logo in Settings,
 * e.g. "Fee Vouchers · Seek School". A missing database falls back to a plain name.
 */
export async function generateMetadata(): Promise<Metadata> {
  let name = "School Management";
  let icon: string | undefined;
  try {
    const s = await settingsService.get();
    name = s.schoolName?.trim() || name;
    if (s.logoUpdatedAt) icon = `/api/settings/logo?v=${new Date(s.logoUpdatedAt).getTime()}`;
  } catch {
    /* keep the plain name */
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    description: `${name} — school management`,
    ...(icon ? { icons: { icon } } : {}),
  };
}

/** Theme comes from Settings; a missing database must never block rendering. */
async function themeStyle() {
  try {
    const settings = await settingsService.get();
    return themeCss(settings.theme);
  } catch {
    return themeCss(null);
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const css = await themeStyle();
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable}`}
    >
      <head>
        <style id="school-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
