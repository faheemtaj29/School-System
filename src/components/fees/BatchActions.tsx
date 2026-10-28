"use client";

/** After challans are generated: print all of them and send them to parents on WhatsApp, in one go. */
export function BatchActions({ batch, count }: { batch: string; count: number }) {
  return (
    <div className="batch-actions">
      <span>
        <b>{count}</b> challan{count === 1 ? "" : "s"} ready
      </span>
      <a className="btn-dark" href={`/print/fee-challans?batch=${batch}`} target="_blank" rel="noreferrer">
        Print all
      </a>
      <a className="wa-btn" href={`/messages?kind=fee&batch=${batch}`}>
        Send all on WhatsApp
      </a>
    </div>
  );
}
