"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { FeeItem, FeePaymentItem } from "@/lib/types";
import { formatNumber, fullName, prettyDate, toDateInput } from "@/lib/types";
import { inputClass } from "@/components/ui";

type AccountOption = {
  code: string;
  name: string;
  isPosting: boolean;
  isCashBank: boolean;
  isActive: boolean;
  systemKey?: string;
};

export function FeePaymentDialog({
  fee,
  initialReceipt,
  canReverse = false,
  onClose,
  onSaved,
}: {
  fee: FeeItem;
  initialReceipt?: FeePaymentItem;
  canReverse?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const student = typeof fee.studentId === "object" ? fee.studentId : null;
  const outstanding = Math.max(0, fee.amount - fee.paidAmount);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [method, setMethod] = useState<FeePaymentItem["method"]>("cash");
  const [depositAccountCode, setDepositAccountCode] = useState("");
  const [amount, setAmount] = useState(outstanding);
  const [paymentDate, setPaymentDate] = useState(toDateInput(new Date()));
  const [transactionReference, setTransactionReference] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<FeePaymentItem | undefined>(initialReceipt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const availableAccounts = useMemo(
    () => accounts.filter((account) => account.isActive && account.isPosting && account.isCashBank),
    [accounts]
  );

  useEffect(() => {
    fetch("/api/fees?view=deposit-accounts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load accounts");
        const choices: AccountOption[] = (data.accounts || []).filter(
          (account: AccountOption) => account.isCashBank && account.isPosting && account.isActive
        );
        setAccounts(choices);
        const preferred =
          choices.find((account) => account.systemKey === "cash") ||
          choices.find((account) => account.systemKey === "bank");
        if (preferred) setDepositAccountCode(preferred.code);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to load cash and bank accounts");
      });
  }, []);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/fees/${fee._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collect",
          idempotencyKey,
          amount,
          method,
          depositAccountCode,
          paymentDate,
          transactionReference: transactionReference.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment could not be recorded");
        return;
      }
      setReceipt(data.payment);
      onSaved();
    } catch {
      setError("Could not reach the server. The payment was not confirmed; retry safely.");
    } finally {
      setBusy(false);
    }
  }

  async function reverseReceipt() {
    const reason = window.prompt("Enter the reason for reversing this receipt:");
    if (!reason?.trim()) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/fees/${fee._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reverse-payment",
          paymentId: receipt?._id,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Receipt could not be reversed");
        return;
      }
      setReceipt(data.payment);
      onSaved();
    } catch {
      setError("Could not reach the server. The reversal was not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    document.body.classList.add("printing-modal");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-modal"), 500);
  }

  const showingReceipt = Boolean(receipt);
  const person = student ? `${fullName(student)} · ${student.admissionNo}` : "Student record";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="modal fee-payment-modal" role="dialog" aria-modal="true" aria-labelledby="fee-payment-title">
        <div className="modal-head">
          <div>
            <h2 id="fee-payment-title">{showingReceipt ? "Payment Receipt" : "Receive Fee Payment"}</h2>
            <p>{person}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {error ? <div className="alert err" role="alert" style={{ margin: 16 }}>{error}</div> : null}

        {showingReceipt && receipt ? (
          <div className="fee-receipt" id="fee-payment-receipt">
            <div className="fee-receipt-header">
              <div>
                <div className="fee-receipt-kicker">Student fee receipt</div>
                <h3>{receipt.receiptNumber}</h3>
              </div>
              <span className={`fee-receipt-stamp ${receipt.status}`}>
                {receipt.status === "posted" ? "PAID" : "REVERSED"}
              </span>
            </div>
            <div className="fee-receipt-grid">
              <div><span>Student</span><strong>{person}</strong></div>
              <div><span>Fee challan</span><strong>{fee.title}</strong></div>
              <div><span>Payment date</span><strong>{prettyDate(receipt.paymentDate)}</strong></div>
              <div><span>Method</span><strong>{receipt.method.toUpperCase()}</strong></div>
              <div><span>Received</span><strong>PKR {formatNumber(receipt.amount)}</strong></div>
              <div><span>Challan total</span><strong>PKR {formatNumber(fee.amount)}</strong></div>
              <div><span>Transaction reference</span><strong>{receipt.transactionReference || "—"}</strong></div>
              <div>
                <span>Accounting voucher</span>
                <strong>
                  {canReverse ? <Link href="/accounting">{receipt.voucherNumber}</Link> : receipt.voucherNumber}
                </strong>
              </div>
              <div><span>Recorded by</span><strong>{typeof receipt.receivedBy === "object" ? receipt.receivedBy?.name || "Staff user" : "Staff user"}</strong></div>
              <div><span>Recorded at</span><strong>{prettyDate(receipt.createdAt)}</strong></div>
              {receipt.status === "reversed" ? (
                <div className="fee-receipt-reversal">
                  <span>Reversal reason</span>
                  <strong>
                    {receipt.reversalReason || "—"}
                    {receipt.reversedAt ? ` · ${prettyDate(receipt.reversedAt)}` : ""}
                    {typeof receipt.reversedBy === "object" && receipt.reversedBy?.name
                      ? ` · ${receipt.reversedBy.name}`
                      : ""}
                  </strong>
                </div>
              ) : null}
            </div>
            {(fee.payments?.length || 0) > 1 ? (
              <div className="fee-receipt-history no-print">
                <strong>Other receipts for this challan</strong>
                {fee.payments?.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className={item._id === receipt._id ? "active" : ""}
                    onClick={() => setReceipt(item)}
                  >
                    <span>{item.receiptNumber} · {prettyDate(item.paymentDate)}</span>
                    <span>PKR {formatNumber(item.amount)} · {item.status === "posted" ? "Paid" : "Reversed"}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="fee-receipt-actions no-print">
              <button type="button" className="btn-dark" onClick={printReceipt}>Print Receipt</button>
              {canReverse && receipt.status === "posted" ? (
                <button type="button" className="btn-ghost" onClick={reverseReceipt} disabled={busy}>
                  {busy ? "Reversing…" : "Reverse Receipt"}
                </button>
              ) : null}
              <button type="button" className="btn-ghost" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form className="fee-payment-form" onSubmit={submitPayment}>
            <div className="fee-payment-summary">
              <div><span>Student</span><strong>{person}</strong></div>
              <div><span>Fee challan</span><strong>{fee.title}</strong></div>
              <div><span>Outstanding balance</span><strong>PKR {formatNumber(outstanding)}</strong></div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Amount received (PKR)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0.01"
                  max={outstanding}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                  required
                />
              </label>
              <label className="field">
                <span>Payment method</span>
                <select
                  className={inputClass}
                  value={method}
                  onChange={(event) => setMethod(event.target.value as FeePaymentItem["method"])}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                  <option value="online">Online</option>
                  <option value="card">Card</option>
                </select>
              </label>
              <label className="field">
                <span>Deposit account</span>
                <select
                  className={inputClass}
                  value={depositAccountCode}
                  onChange={(event) => setDepositAccountCode(event.target.value)}
                  required
                >
                  <option value="">Select a Cash/Bank account</option>
                  {availableAccounts.map((account) => (
                    <option key={account.code} value={account.code}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Payment date</span>
                <input
                  className={inputClass}
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  required
                />
              </label>
              <label className="field fee-payment-reference">
                <span>Transaction reference (optional)</span>
                <input
                  className={inputClass}
                  value={transactionReference}
                  onChange={(event) => setTransactionReference(event.target.value)}
                  maxLength={120}
                  placeholder="Bank slip, transfer ID, or note"
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="btn-dark"
                disabled={busy || !idempotencyKey || amount <= 0 || amount > outstanding || !depositAccountCode}
              >
                {busy ? "Recording payment…" : "Confirm & Generate Receipt"}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
