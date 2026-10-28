import { PayslipPrintPage } from "@/components/print/PayslipPrint";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  const id = Array.isArray(q.id) ? q.id[0] : q.id;
  return <PayslipPrintPage id={id || ""} />;
}
