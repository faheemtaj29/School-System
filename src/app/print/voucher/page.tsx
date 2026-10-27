import { VoucherPrintPage } from "@/components/print/VoucherPrint";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  return <VoucherPrintPage id={one(q.id)} />;
}
