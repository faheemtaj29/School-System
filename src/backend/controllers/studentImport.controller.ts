/**
 * Excel import of students — GET downloads the template; POST (form data: file, mode) checks the
 * rows ("check") or saves the ones without mistakes ("save"). Admin only.
 */
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { studentImportService } from "@/backend/services/studentImport.service";

export const studentImportController = {
  async template() {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const file = await studentImportService.template();
      return new Response(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="students-import-template.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async upload(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) return jsonError("Choose the Excel file to upload");
      if (file.size > 5 * 1024 * 1024) return jsonError("The file is larger than 5 MB");
      const rows = await studentImportService.read(file);
      if (form!.get("mode") === "save") return jsonOk(await studentImportService.save(rows), 201);
      const { rows: checked, summary } = await studentImportService.check(rows);
      return jsonOk({ rows: checked, summary });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
