import { GeneralLedgerPrintPage } from "@/components/print/LedgerPrint";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const KEYS = ["account", "head", "branch", "from", "to"];

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const v = q[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params.set(key, value);
  }
  return <GeneralLedgerPrintPage query={params.toString()} />;
}
