import { DiplomaPrint } from "@/components/print/StudentPrints";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || "";

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  return <DiplomaPrint id={one(query.id)} />;
}
