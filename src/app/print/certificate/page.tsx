import { CertificatePrint } from "@/components/print/StudentPrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  return <CertificatePrint studentId={one(q.student)} type={one(q.type) || "character"} />;
}
