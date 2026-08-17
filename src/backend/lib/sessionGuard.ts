import { ClassModel } from "@/backend/models/Class";
import { AcademicSession } from "@/backend/models/AcademicSession";
import { ServiceError } from "@/backend/types";

/** Blocks mutable operations when the target class belongs to a closed session. */
export async function assertSessionWritableForClass(classId: string) {
  const cls = await ClassModel.findById(classId).select("academicYear").lean();
  if (!cls?.academicYear) return;
  const session = await AcademicSession.findOne({ name: cls.academicYear })
    .select("status name")
    .lean();
  if (session?.status === "closed") {
    throw new ServiceError(
      "CONFLICT",
      `Session '${session.name}' is closed and cannot be modified`,
      409
    );
  }
}

/** Blocks mutable operations when explicit academicYear belongs to a closed session. */
export async function assertSessionWritableForYear(academicYear: string) {
  const clean = academicYear?.trim();
  if (!clean) return;
  const session = await AcademicSession.findOne({ name: clean })
    .select("status name")
    .lean();
  if (session?.status === "closed") {
    throw new ServiceError(
      "CONFLICT",
      `Session '${session.name}' is closed and cannot be modified`,
      409
    );
  }
}

/** Blocks subject edits when that subject is still attached to a class in a closed session. */
export async function assertSessionWritableForSubject(subjectId: string) {
  const clean = subjectId?.trim();
  if (!clean) return;

  const classes = await ClassModel.find({ subjects: clean })
    .select("academicYear name section")
    .lean();

  for (const cls of classes) {
    const session = await AcademicSession.findOne({ name: cls.academicYear })
      .select("status name")
      .lean();
    if (session?.status === "closed") {
      throw new ServiceError(
        "CONFLICT",
        `Session '${session.name}' is closed and cannot be modified`,
        409
      );
    }
  }
}
