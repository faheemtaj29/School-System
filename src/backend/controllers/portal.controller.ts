/**
 * Parent / student portal: the children this login may see.
 */
import { dbConnect } from "@/backend/config/database";
import { fromServiceError, jsonOk, requireAuth } from "@/backend/lib/http";
import { photoUrl } from "@/backend/lib/images";
import { resolveChildren } from "@/backend/lib/portal";
import { ClassModel } from "@/backend/models/Class";

export const portalController = {
  async children() {
    const { session, error } = await requireAuth(["student", "parent"]);
    if (error) return error;
    try {
      await dbConnect();
      const kids = await resolveChildren(session!);
      const classes = await ClassModel.find({ _id: { $in: kids.map((k) => k.classId) } })
        .select("name section")
        .lean();
      return jsonOk({
        role: session!.role,
        children: kids.map((k) => {
          const c = classes.find((x) => String(x._id) === String(k.classId));
          return {
            _id: String(k._id),
            name: `${k.firstName} ${k.lastName}`,
            admissionNo: k.admissionNo,
            className: c ? `${c.name}${c.section ? ` – ${c.section}` : ""}` : "",
            photoUrl: photoUrl("student", k._id, k.photoUpdatedAt),
          };
        }),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
