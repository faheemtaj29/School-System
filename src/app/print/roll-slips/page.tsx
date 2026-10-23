import { RollSlipsPrint } from "@/components/print/ExamPrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  return <RollSlipsPrint termId={one(q.termId)} classIds={one(q.classIds)} perPage={Number(one(q.perPage)) || 2} />;
}
