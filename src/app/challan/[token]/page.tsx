import { FeeChallansPrint } from "@/components/print/FeePrints";

type Props = { params: Promise<{ token: string }> };

/** A parent's fee challan from a signed WhatsApp/SMS link — no login; print or save as PDF. */
export default async function Page({ params }: Props) {
  const { token } = await params;
  return (
    <div className="print-root">
      <FeeChallansPrint query="" copies={3} src={`/api/public/challan?t=${encodeURIComponent(token)}`} />
    </div>
  );
}
