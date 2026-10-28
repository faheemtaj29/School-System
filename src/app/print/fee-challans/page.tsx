import { FeeChallansPrint } from "@/components/print/FeePrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["month", "classId", "status", "ids", "batch"]) if (one(q[key])) query.set(key, one(q[key]));
  return <FeeChallansPrint query={query.toString()} copies={Number(one(q.copies)) || 3} />;
}
