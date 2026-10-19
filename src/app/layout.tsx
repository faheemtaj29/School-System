import type { Metadata } from "next";
import localFont from "next/font/local";
import { settingsService } from "@/backend/services/settings.service";
import { themeCss } from "@/lib/theme";
import "./globals.css";

/** Fonts bundled locally — no Google Fonts network request needed. */
const display = localFont({
  variable: "--font-display",
  src: [
    { path: "./fonts/spectral-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/spectral-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/spectral-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

const sans = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/work-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/work-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/work-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/work-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

const mono = localFont({
  variable: "--font-mono",
  src: [
    { path: "./fonts/space-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sabaq — School Management System",
  description: "School management built with Next.js, React and MongoDB",
};

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
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <style id="sabaq-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
