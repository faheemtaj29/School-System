import type { Metadata } from "next";
import { Spectral, Work_Sans, Space_Mono } from "next/font/google";
import { settingsService } from "@/backend/services/settings.service";
import { themeCss } from "@/lib/theme";
import "./globals.css";

const display = Spectral({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Work_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
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
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <style id="sabaq-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
