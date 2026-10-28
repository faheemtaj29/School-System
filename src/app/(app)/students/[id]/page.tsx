"use client";

import { useParams } from "next/navigation";
import { StudentProfileView } from "@/components/students/StudentProfileView";

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <StudentProfileView id={id} />;
}
