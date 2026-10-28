import { IdCardsPrint, StaffIdCardsPrint } from "@/components/print/StudentPrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

/** Student cards by class or ids; ?kind=teacher|staff prints employee cards instead. */
export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  const kind = one(q.kind);
  if (kind === "teacher" || kind === "staff") return <StaffIdCardsPrint kind={kind} ids={one(q.ids)} />;
  return <IdCardsPrint classIds={one(q.classIds)} ids={one(q.ids)} />;
}
