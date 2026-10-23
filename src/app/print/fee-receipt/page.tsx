import { FeeReceiptPrint } from "@/components/print/FeePrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  return <FeeReceiptPrint id={one(q.id)} receiptNo={one(q.receiptNo)} />;
}
