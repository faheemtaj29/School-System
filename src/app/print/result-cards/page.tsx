import { ResultCardsPrint } from "@/components/print/ExamPrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  return <ResultCardsPrint termId={one(q.termId)} classIds={one(q.classIds)} studentId={one(q.student) || undefined} />;
}
