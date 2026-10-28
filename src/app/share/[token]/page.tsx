import { DateSheetPrint, ResultCardsPrint } from "@/components/print/ExamPrints";

type Props = { params: Promise<{ token: string }> };

/** A result card or date sheet from a signed WhatsApp/SMS link — no login; print or save as PDF. */
export default async function Page({ params }: Props) {
  const { token } = await params;
  const src = `/api/public/doc?t=${encodeURIComponent(token)}`;
  return (
    <div className="print-root">
      {token.startsWith("r-") ? (
        <ResultCardsPrint termId="" classIds="" src={src} />
      ) : (
        <DateSheetPrint termId="" classIds="" src={src} />
      )}
    </div>
  );
}
