import { settingsService } from "@/backend/services/settings.service";

export async function GET() {
  try {
    const settings = await settingsService.get();
    return Response.json({
      branding: {
        schoolName: settings.schoolName,
        logoUrl: settings.logoUrl || "",
        motto: settings.motto || "",
      },
    });
  } catch (error) {
    console.error("Could not load public school branding", error);
    return Response.json({ error: "Could not load school branding" }, { status: 503 });
  }
}
