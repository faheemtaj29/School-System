/** Theme vocabulary shared by the settings UI and the server-rendered style tag. */

export type Theme = {
  preset: string;
  primary: string;
  accent: string;
  sidebar: string;
  surface: string;
  radius: number;
  solid: boolean;
};

export type ThemePreset = {
  key: string;
  name: string;
  primary: string;
  accent: string;
  sidebar: string;
  surface: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  { key: "jade", name: "Sabaq Jade", primary: "#157a5c", accent: "#e8992e", sidebar: "#0e211a", surface: "#f4f6f2" },
  { key: "indigo", name: "Indigo Night", primary: "#4c5fd5", accent: "#f0a500", sidebar: "#161a3d", surface: "#f4f5fb" },
  { key: "royal", name: "Royal Blue", primary: "#1d4ed8", accent: "#0ea5e9", sidebar: "#0f1c3f", surface: "#f3f6fb" },
  { key: "maroon", name: "Maroon Classic", primary: "#9b2c2c", accent: "#d69e2e", sidebar: "#2b1414", surface: "#faf5f4" },
  { key: "teal", name: "Deep Teal", primary: "#0f766e", accent: "#f59e0b", sidebar: "#10231f", surface: "#f2f7f6" },
  { key: "plum", name: "Plum Study", primary: "#6d28d9", accent: "#ec4899", sidebar: "#1d1130", surface: "#f7f4fc" },
  { key: "graphite", name: "Graphite", primary: "#334155", accent: "#0ea5e9", sidebar: "#0f172a", surface: "#f4f6f8" },
];

export const DEFAULT_THEME: Theme = {
  preset: "jade",
  primary: THEME_PRESETS[0].primary,
  accent: THEME_PRESETS[0].accent,
  sidebar: THEME_PRESETS[0].sidebar,
  surface: THEME_PRESETS[0].surface,
  radius: 14,
  solid: true,
};

function channels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [21, 122, 92];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: [number, number, number]) {
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Blends a colour towards white (amount > 0) or black (amount < 0). */
export function shift(hex: string, amount: number) {
  const [r, g, b] = channels(hex);
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return toHex([
    r + (target - r) * ratio,
    g + (target - g) * ratio,
    b + (target - b) * ratio,
  ]);
}

export function themeVars(input?: Partial<Theme> | null): Record<string, string> {
  const theme = { ...DEFAULT_THEME, ...(input || {}) };
  const primary = theme.primary || DEFAULT_THEME.primary;
  const accent = theme.accent || DEFAULT_THEME.accent;
  const sidebar = theme.sidebar || DEFAULT_THEME.sidebar;
  const surface = theme.surface || DEFAULT_THEME.surface;
  const primaryDark = shift(primary, -0.22);
  const primaryBright = shift(primary, 0.18);
  const accentDark = shift(accent, -0.16);
  const sidebarSoft = shift(sidebar, 0.12);

  return {
    "--jade": primary,
    "--jade-dark": primaryDark,
    "--jade-light": shift(primary, 0.86),
    "--saffron": accent,
    "--saffron-light": shift(accent, 0.85),
    "--ink": sidebar,
    "--ink-soft": sidebarSoft,
    "--paper": surface,
    "--radius": `${theme.radius || DEFAULT_THEME.radius}px`,
    "--sidebar-bg": theme.solid
      ? sidebar
      : `linear-gradient(190deg, ${sidebar} 0%, ${sidebarSoft} 100%)`,
    "--accent-bg": theme.solid
      ? accent
      : `linear-gradient(135deg, ${accent}, ${accentDark})`,
    "--hero-bg": theme.solid
      ? primary
      : `radial-gradient(120% 160% at 100% 0%, ${primaryBright} 0%, ${primary} 45%, ${primaryDark} 100%)`,
    "--auth-bg": theme.solid
      ? sidebar
      : `radial-gradient(120% 140% at 100% 0%, ${primaryBright} 0%, ${sidebarSoft} 45%, ${sidebar} 100%)`,
    "--site-hero-bg": theme.solid
      ? sidebar
      : `linear-gradient(135deg, ${sidebar} 0%, ${primaryDark} 100%)`,
    "--stripe-bg": theme.solid ? primary : `linear-gradient(90deg, ${primary}, ${accent})`,
    "--bar-primary": theme.solid
      ? primary
      : `linear-gradient(180deg, ${primaryBright} 0%, ${primary} 55%, ${primaryDark} 100%)`,
    "--bar-accent": theme.solid
      ? accent
      : `linear-gradient(180deg, ${shift(accent, 0.3)} 0%, ${accent} 60%, ${accentDark} 100%)`,
    "--bar-indigo": theme.solid
      ? "var(--indigo)"
      : "linear-gradient(180deg, #7c8ef0 0%, var(--indigo) 60%, #3947a8 100%)",
  };
}

export function themeCss(input?: Partial<Theme> | null) {
  const vars = themeVars(input);
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `:root{${body}}`;
}
