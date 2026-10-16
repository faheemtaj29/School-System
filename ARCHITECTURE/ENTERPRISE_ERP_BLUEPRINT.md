# Enterprise Accounting & Inventory Platform — Architecture Blueprint

| | |
|---|---|
| **Status** | Target-state specification v1.0 (2026-10-16) |
| **Scope** | General ledger, multi-currency, banking, inventory & costing, manufacturing, O2C, P2P, tax, audit, reporting, concurrency, integration APIs, dealership vertical |
| **Applies to** | `faheemtaj29/School-System` (Sabaq ERP) and its Dealership module |
| **Conventions** | Money and quantities are `NUMERIC(20,4)` (rates `NUMERIC(20,10)`, FX `NUMERIC(24,12)`). All timestamps `TIMESTAMPTZ` stored in UTC. All IDs are `UUID v7` (time-ordered) unless stated. SQL is PostgreSQL 16. "MUST/SHOULD/MAY" follow RFC 2119. |

> **Verification status.** The §8.1 DDL, the balance triggers (§1.2.2), the immutability trigger
> (§1.2.3), the period gate (§5.3.2) and the `stock_positions` allocation pattern (§7.1.1) were
> loaded into PostgreSQL 16.15 and exercised: balanced entries commit; unbalanced and single-line
> entries fail at COMMIT; posts into a HARD_CLOSED period, edits and deletes of posted entries
> are rejected; POSTED → REVERSED with a pointer is allowed; and 50 concurrent sessions allocating
> the last unit produced exactly one winner. Other SQL in this document (reporting queries,
> lots/serials, tax, audit, BOM) is specification-grade and has **not** been executed.

---

## 0. Current state and how to get from here to there

This blueprint is the target. It is deliberately written against a relational ledger, because the
guarantees asked for (structural debit = credit, serializable posting, hard period locks,
append-only history) are enforced most cheaply by PostgreSQL constraints and triggers. The
current code base is MongoDB/Mongoose. The table below is an honest gap list so the roadmap in
§0.3 is grounded in what exists.

### 0.1 What exists today

| Area | Current implementation | File(s) |
|---|---|---|
| Chart of accounts | 5-level hierarchy, `code`, `parentCode`, `isControl`/`isPosting`, `systemKey` for reserved accounts | `src/backend/models/Accounting.ts` |
| Vouchers | Double-entry `Voucher` with `lines[]`, draft/posted/void, numbering via `AccountingCounter` (`PREFIX:BRANCH:YEAR`) | `accounting.service.ts` |
| Debit = credit check | Application-level in `enrichAndValidateLines` (each line debit XOR credit) | `accounting.service.ts` |
| Sub-ledger posting | `accountingService.upsertLinked({sourceType, sourceId, …})` — one voucher per source document, idempotent by `(sourceType, sourceId)` unique partial index | `accounting.service.ts`, `models/Accounting.ts` |
| Inventory | Item master with per-branch `stock[]` buckets; stock vouchers (purchase, sales, returns, transfer, adjustment) with draft → posted → void; reversal on void | `models/Inventory.ts`, `inventory.service.ts` |
| Costing | **Last purchase cost** overwrites `unitCost` on purchase posting. No FIFO layers, no moving average, no landed cost | `inventory.service.ts › applyStock` |
| Tax | Single rate, inclusive/exclusive toggle, WHT on vendor payments | `Settings`, `tax.service.ts` |
| Audit | `AuditEvent` collection, before/after snapshot, best-effort (failure is swallowed) | `lib/audit.ts` |
| Dealership | Vehicles (unit-level stock, cost + recon), CRM, deals, receipts, financing, delivery, public marketplace; posts to ledger via `upsertLinked` | `dealership.service.ts`, `marketplace.service.ts` |
| Money type | JavaScript `Number` (IEEE-754 double), rounded to 2 dp in code | everywhere |

### 0.2 Gaps against this blueprint (ranked by financial risk)

| # | Gap | Risk | Blueprint section |
|---|---|---|---|
| G1 | Money stored as binary floating point | Rounding drift in sums; trial balance can be off by sub-unit amounts | §1.2, §8.1 |
| G2 | No database-level debit = credit or immutability guarantee; posted vouchers are updated in place by `upsertLinked` | A bug or a direct DB write can unbalance or silently rewrite the ledger | §1.2, §5.2 |
| G3 | No accounting periods / hard locks | Back-dated postings into reported periods | §5.3 |
| G4 | Multi-document writes are not in one transaction (e.g. deal delivery touches deal, vehicle, customer, ledger) | Partial failure leaves sub-ledger and GL out of sync | §1.2, §7.2 |
| G5 | Last-cost inventory valuation | COGS and stock value not compliant with IAS 2 / ASC 330 | §2.1 |
| G6 | Audit log can be deleted and failures are swallowed | Not evidential | §5.2 |
| G7 | Single currency, single tax rate | Blocks import/export and multi-region | §1.3, §5.1 |
| G8 | Stock check-and-decrement is read-modify-write without a lock | Overselling under concurrency | §7.1 |

### 0.3 Migration strategy (strangler pattern, no big-bang)

1. **Phase A — Harden in place (MongoDB, 2–3 sprints).** Switch money fields to `Decimal128`
   with a `Money` value object; wrap every multi-document posting in a MongoDB multi-document
   transaction (`session.withTransaction`, `readConcern: "snapshot"`, `writeConcern: "majority"`);
   stop mutating posted vouchers (reverse + re-post instead); add `accounting_periods` with a hard
   lock checked inside the same transaction; make audit writes part of the transaction.
   Closes G1, G2 (partially), G3, G4, G6.
2. **Phase B — Ledger service on PostgreSQL.** Stand up the schema in §8 for `accounts`,
   `journal_entries`, `journal_lines`, `periods`, `audit_log`. All writes go through a
   `LedgerPort` interface; the Mongo implementation and the Postgres implementation run in
   **dual-write shadow mode** for one full close cycle, with a nightly reconciliation job
   comparing trial balances per account per period. Cut over reads when the diff is zero for
   two consecutive closes.
3. **Phase C — Inventory ledger and costing on PostgreSQL.** Move `inventory_ledger`,
   `cost_layers`, `items`, `warehouses`; implement FIFO/MAC (§2.1). Historical stock is loaded as
   one opening layer per item per warehouse at the cut-over date's valued cost.
4. **Phase D — O2C/P2P documents, tax engine, bank feeds, integrations** (§4, §5.1, §1.5, §8.2).
   Operational modules (CRM, school SIS, marketplace) MAY stay on MongoDB; they talk to the
   financial core only through commands and events (§7.2).

---

## 1. Core double-entry accounting engine & controls

### 1.1 Hierarchical chart of accounts

#### 1.1.1 Account classes and normal balances

| Class | Code range (natural account) | Normal balance | Closes to | Statement |
|---|---|---|---|---|
| 1 Assets | 1000–1999 | Debit | — (permanent) | Balance sheet |
| 2 Liabilities | 2000–2999 | Credit | — | Balance sheet |
| 3 Equity | 3000–3999 | Credit | — | Balance sheet |
| 4 Revenue | 4000–4999 | Credit | Retained earnings | P&L |
| 5 Cost of goods sold | 5000–5999 | Debit | Retained earnings | P&L |
| 6 Operating expenses | 6000–6999 | Debit | Retained earnings | P&L |
| 7 Other income / expense | 7000–7999 | Either (flag per account) | Retained earnings | P&L |
| 8 Tax expense | 8000–8999 | Debit | Retained earnings | P&L |
| 9 Statistical / memo | 9000–9999 | n/a, non-monetary units allowed | never | KPI only |

Hierarchy is a tree per tenant: **Class → Group → Sub-group → Control account → Posting
account**. Only leaves with `is_postable = true` accept journal lines. Parents are pure roll-ups.
The tree is stored as an adjacency list (`parent_id`) **plus** a materialised path (`ltree`) so a
subtree balance is a single indexed range scan:

```sql
CREATE EXTENSION IF NOT EXISTS ltree;
-- path example: '1.11.1110.1110_001'  (class.group.control.leaf)
CREATE INDEX accounts_path_gist ON accounts USING GIST (path);
SELECT sum(b.balance_base) FROM account_balances b
JOIN accounts a ON a.id = b.account_id
WHERE a.tenant_id = $1 AND a.path <@ '1.11';   -- all current assets
```

#### 1.1.2 Multi-segment GL string

Every journal line carries a **GL combination**, not just an account:

```
CCC-DDD-LLLL-AAAAAA-PPPPPP
 |    |    |     |      └─ Project / job (optional, 6 alnum)
 |    |    |     └──────── Natural account (6 alnum, from accounts.code)
 |    |    └────────────── Location / branch (4 alnum)
 |    └─────────────────── Department / cost centre (3 alnum)
 └──────────────────────── Legal entity / company (3 alnum)
```

* Segments are defined per tenant in `gl_segments(tenant_id, position, name, length, charset,
  required, value_table)`. The mask is compiled to a regex at tenant setup, e.g.
  `^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{4}-[0-9]{4}[A-Z0-9]{2}-([A-Z0-9]{6}|0{6})$`.
* Valid values live in `gl_segment_values(segment_id, code, name, parent_code, is_active,
  valid_from, valid_to)`.
* **Cross-validation rules** (`gl_cvr`) reject illegal combinations, e.g. "Revenue accounts
  4xxx require a department", "balance-sheet accounts 1xxx–3xxx MUST use department `000`",
  "project segment only allowed with expense 6xxx". Rules are evaluated as compiled predicates on
  insert of a new combination.
* Combinations are interned in `gl_combinations(id, tenant_id, company, department, location,
  account_id, project, combo_string UNIQUE)`; journal lines reference `combination_id`. This
  keeps lines narrow and lets every report pivot on any segment.

#### 1.1.3 Masking and naming rules

| Rule | Enforcement |
|---|---|
| Codes are upper-case alphanumeric, no spaces, fixed length per segment | `CHECK (code ~ '^[A-Z0-9]+$')` + length check against segment definition |
| A child's natural-account code MUST start with its parent's prefix | Trigger on insert/update comparing `left(code, length(parent.code))` |
| `account_type` of a child MUST equal its parent's | Trigger |
| An account with posted lines cannot change `account_type`, `normal_balance`, `currency_mode` or become non-postable | Trigger checks `EXISTS (SELECT 1 FROM journal_lines …)` |
| Accounts are never deleted, only `is_active = false` with `deactivated_at` | No `DELETE` privilege granted to the app role |
| Names unique among siblings | `UNIQUE (tenant_id, parent_id, lower(name))` |

#### 1.1.4 System-reserved accounts

Reserved accounts are seeded per company and addressed by a stable `system_key`, never by code,
so tenants may renumber freely.

| `system_key` | Purpose | Posting restrictions |
|---|---|---|
| `RETAINED_EARNINGS` | Year-end close target | Only the close process may post |
| `CURRENT_YEAR_EARNINGS` | Virtual: computed, never posted | No lines allowed |
| `AR_CONTROL` | Trade receivables control | Only from AR sub-ledger (invoices, receipts, credit notes) |
| `AP_CONTROL` | Trade payables control | Only from AP sub-ledger |
| `INVENTORY_ASSET` (per item category MAY override) | Stock on hand | Only from inventory ledger |
| `GRNI` | Goods received not invoiced | GRN and 3-way match only |
| `STOCK_IN_TRANSIT` | Inter-warehouse transfers | Transfer ship/receive only |
| `INVENTORY_ADJUSTMENT` | Shrinkage, damage, count variance | Stock adjustments |
| `PPV` | Purchase price variance | Invoice match (standard/MAC variance) |
| `COGS` | Cost of goods sold | Shipments, invoices |
| `WIP` | Work in progress | Production orders |
| `LANDED_COST_CLEARING` | Freight/duty awaiting allocation | Landed cost vouchers |
| `FX_REALIZED_GAIN_LOSS` | Realised FX | Settlement engine |
| `FX_UNREALIZED_GAIN_LOSS` | Unrealised FX (reverses next period) | Revaluation job |
| `FX_ROUNDING` | Sub-unit translation residue | Posting engine |
| `TAX_OUTPUT_<code>` / `TAX_INPUT_<code>` | Per tax code | Tax engine |
| `SUSPENSE` | Unidentified bank items | Bank rec; MUST be zero at period close |
| `INTERCOMPANY_DUE_FROM_<co>` / `DUE_TO_<co>` | Inter-company | IC journals only |
| `CUSTOMER_DEPOSITS` | Advances before delivery (dealership deposits belong here, see §4.1.6) | Receipts with no invoice |
| `UNDEPOSITED_FUNDS` | Receipts not yet banked | Receipts → deposit |

A posting to a reserved account from a source not in its allow-list raises
`ERR_RESERVED_ACCOUNT_SOURCE`. Allow-lists live in `account_source_rules(account_id,
source_type)`.

### 1.2 Transactional atomicity & GL integrity

The invariant is **Σ debit_base = Σ credit_base for every journal entry**, and therefore for
every period, company and the ledger as a whole. It is enforced in four independent layers so a
bug in any one cannot break it.

#### 1.2.1 Layer 1 — line-level constraints

```sql
CREATE TABLE journal_lines (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  entry_id        UUID NOT NULL REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED,
  line_no         INT  NOT NULL,
  combination_id  UUID NOT NULL REFERENCES gl_combinations(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),           -- denormalised for indexes
  debit_txn       NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit_txn  >= 0),
  credit_txn      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit_txn >= 0),
  currency        CHAR(3) NOT NULL,
  fx_rate         NUMERIC(24,12) NOT NULL CHECK (fx_rate > 0),
  debit_base      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit_base  >= 0),
  credit_base     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  -- set only by the FX engine for base-only revaluation lines (txn side is zero)
  is_base_only    BOOLEAN NOT NULL DEFAULT false,
  -- exactly one side, never both, never neither
  CONSTRAINT one_side_txn  CHECK (is_base_only OR ((debit_txn > 0) <> (credit_txn > 0))),
  CONSTRAINT base_only_txn CHECK (NOT is_base_only OR (debit_txn = 0 AND credit_txn = 0)),
  CONSTRAINT one_side_base CHECK ((debit_base > 0) <> (credit_base > 0)),
  -- base side follows txn side
  CONSTRAINT same_side     CHECK (is_base_only OR ((debit_txn > 0) = (debit_base > 0))),
  UNIQUE (entry_id, line_no)
);
```

`is_base_only` lines exist only for unrealised FX revaluation (§1.3.4), where the transaction
currency amount does not change but its base value does. A `CHECK` never calls a lookup
function: constraints must be immutable and self-contained.

#### 1.2.2 Layer 2 — entry-level balance via deferred constraint trigger

A row-level `CHECK` cannot see sibling rows, so balance is checked **at commit** with a
`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`. It fires once per affected entry after all
lines of the transaction are written:

```sql
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE d NUMERIC(20,4); c NUMERIC(20,4); n INT; st TEXT;
BEGIN
  SELECT status INTO st FROM journal_entries WHERE id = NEW.entry_id;
  IF st IN ('POSTED','REVERSED') THEN
    SELECT coalesce(sum(debit_base),0), coalesce(sum(credit_base),0), count(*)
      INTO d, c, n
      FROM journal_lines WHERE entry_id = NEW.entry_id;
    IF n < 2 THEN
      RAISE EXCEPTION 'ERR_ENTRY_TOO_FEW_LINES entry=%', NEW.entry_id USING ERRCODE = '23514';
    END IF;
    IF d <> c THEN
      RAISE EXCEPTION 'ERR_ENTRY_UNBALANCED entry=% debit=% credit=%', NEW.entry_id, d, c
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- also re-check when an entry flips to POSTED (lines may have been written while DRAFT)
CREATE OR REPLACE FUNCTION assert_entry_balanced_by_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE d NUMERIC(20,4); c NUMERIC(20,4); n INT;
BEGIN
  SELECT coalesce(sum(debit_base),0), coalesce(sum(credit_base),0), count(*)
    INTO d, c, n FROM journal_lines WHERE entry_id = NEW.id;
  IF n < 2 THEN
    RAISE EXCEPTION 'ERR_ENTRY_TOO_FEW_LINES entry=%', NEW.id USING ERRCODE = '23514';
  END IF;
  IF d <> c THEN
    RAISE EXCEPTION 'ERR_ENTRY_UNBALANCED entry=% debit=% credit=%', NEW.id, d, c USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER journal_entries_balanced_on_post
  AFTER INSERT OR UPDATE OF status ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.status = 'POSTED')
  EXECUTE FUNCTION assert_entry_balanced_by_entry();
```

Per-row firing is O(lines²) for a big entry; for entries above ~500 lines the application uses
`SET CONSTRAINTS journal_lines_balanced IMMEDIATE` after the bulk insert, which still executes
inside the same transaction, or the statement-level variant using transition tables
(`REFERENCING NEW TABLE AS new_lines … FOR EACH STATEMENT`) and `GROUP BY entry_id`.

#### 1.2.3 Layer 3 — immutability of posted entries

```sql
CREATE OR REPLACE FUNCTION forbid_posted_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ERR_LEDGER_APPEND_ONLY' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('POSTED','REVERSED') THEN
    -- the only legal change: POSTED -> REVERSED with the reversal pointer set,
    -- every other column untouched
    IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED'
            AND NEW.reversed_by_entry_id IS NOT NULL
            AND (to_jsonb(NEW) - 'status' - 'reversed_by_entry_id' - 'updated_at')
                = (to_jsonb(OLD) - 'status' - 'reversed_by_entry_id' - 'updated_at')) THEN
      RAISE EXCEPTION 'ERR_POSTED_ENTRY_IMMUTABLE entry=%', OLD.id USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_posted_mutation();
```

Lines of a
posted entry get a `BEFORE UPDATE OR DELETE` trigger that always raises. The application DB role
has `INSERT, SELECT` on `journal_lines` and `INSERT, SELECT, UPDATE(status, reversed_by_entry_id,
updated_at)` on `journal_entries`; **no role used by the application has `DELETE` or
`TRUNCATE`**. Corrections are always new entries (§1.4).

#### 1.2.4 Layer 4 — isolation level and posting protocol

Posting runs in a single database transaction at **`SERIALIZABLE`** isolation:

```
BEGIN ISOLATION LEVEL SERIALIZABLE;
  -- 1. Idempotency: claim the command id (unique). Duplicate → return previous result.
  INSERT INTO posting_commands(id, tenant_id, source_type, source_id, payload_hash)
    VALUES ($cmd, …) ON CONFLICT (id) DO NOTHING RETURNING id;
  -- 2. Period gate (§5.3): the period row is read FOR SHARE so a concurrent
  --    close (which takes FOR UPDATE) serialises against us.
  SELECT status FROM accounting_periods
    WHERE company_id = $co AND $date BETWEEN start_date AND end_date FOR SHARE;
  -- 3. Number allocation: gap-free per (company, journal_type, fiscal_year).
  UPDATE number_sequences SET next_value = next_value + 1
    WHERE scope = $scope RETURNING next_value - 1;
  -- 4. Insert header (status POSTED) + lines.
  -- 5. Update account_balances (see below) with UPSERT … SET x = x + EXCLUDED.x.
  -- 6. Insert audit_log row and outbox event (§5.2, §7.2) — same transaction.
COMMIT;   -- deferred balance trigger fires here
```

Why SERIALIZABLE and not READ COMMITTED: the period check, the sequence allocation and the
"is this source already posted" check are all read-then-write decisions. Under READ COMMITTED a
concurrent period close or a duplicate submission could slip between read and write. SSI aborts
one of the conflicting transactions with SQLSTATE `40001`; the application **MUST retry** the
whole unit of work with jittered exponential backoff (max 5 attempts: 20 ms, 40, 80, 160, 320 ms
± 25 %). The idempotency key makes retries safe.

**Balances.** `account_balances(tenant_id, company_id, combination_id, period_id, currency,
debit_txn, credit_txn, debit_base, credit_base)` is maintained in the posting transaction with an
UPSERT. Contention on hot rows (e.g. `AR_CONTROL` in a busy period) is reduced by **striping**:
the PK includes `stripe SMALLINT` (0–15, chosen as `hash(entry_id) % 16`); reads sum the stripes.
A nightly job verifies `account_balances` against a full re-aggregation of `journal_lines` and
alerts on any difference (it is a cache; the lines are the truth).

#### 1.2.5 Application-level verification (before the database sees it)

The posting service validates a `JournalDraft` and returns all errors at once:

| Code | Rule |
|---|---|
| `ERR_ENTRY_TOO_FEW_LINES` | ≥ 2 lines |
| `ERR_LINE_BOTH_SIDES` / `ERR_LINE_ZERO` | Exactly one positive side per line |
| `ERR_ENTRY_UNBALANCED_TXN` | Per currency: Σ debit_txn = Σ credit_txn **unless** the entry is multi-currency, in which case only base must balance |
| `ERR_ENTRY_UNBALANCED_BASE` | Σ debit_base = Σ credit_base after rounding (§1.3.5) |
| `ERR_ACCOUNT_NOT_POSTABLE` | Leaf, active, valid on posting date |
| `ERR_CVR_VIOLATION` | Segment cross-validation |
| `ERR_RESERVED_ACCOUNT_SOURCE` | §1.1.4 |
| `ERR_ACCOUNT_CURRENCY` | Account `currency_mode`: `ANY`, `BASE_ONLY`, or `FIXED:<ISO>` (bank accounts) |
| `ERR_PERIOD_CLOSED` | §5.3 |
| `ERR_INTERCOMPANY_UNBALANCED` | Per company within an IC entry, Σ debit = Σ credit (§1.4.4) |
| `ERR_DUPLICATE_SOURCE` | `(source_type, source_id, source_version)` already posted |
| `ERR_AMOUNT_SCALE` | Max 4 decimal places in storage; currency minor units enforced on presentation amounts (JPY 0, USD 2, KWD 3) |

All arithmetic uses a decimal library (`decimal.js` / `big.js` in TypeScript, `NUMERIC` in SQL).
**IEEE-754 floats are forbidden for money in every layer**, including JSON: amounts are
serialised as strings (`"1234.5600"`).

### 1.3 Multi-currency & FX engine

#### 1.3.1 Currency roles

| Role | Definition |
|---|---|
| Transaction currency (TC) | Currency of the document (invoice in EUR) |
| Functional/base currency (FC) | Currency of the legal entity's books (PKR) |
| Reporting currency (RC) | Group consolidation currency (USD); computed by translation, never posted at line level |

Each journal line stores TC amount, `fx_rate` (TC → FC, "units of FC per 1 TC") and FC amount.
`amount_base = round_half_even(amount_txn × fx_rate, 4)`.

#### 1.3.2 Rate storage and ingestion

```sql
CREATE TABLE fx_rates (
  rate_type     TEXT NOT NULL,          -- SPOT, CLOSING, AVERAGE_M, BUDGET, CUSTOMS
  from_ccy      CHAR(3) NOT NULL,
  to_ccy        CHAR(3) NOT NULL,
  effective_on  DATE NOT NULL,
  rate          NUMERIC(24,12) NOT NULL CHECK (rate > 0),
  source        TEXT NOT NULL,          -- ECB, SBP, OXR, MANUAL
  fetched_at    TIMESTAMPTZ NOT NULL,
  is_override   BOOLEAN NOT NULL DEFAULT false,
  approved_by   UUID,
  PRIMARY KEY (rate_type, from_ccy, to_ccy, effective_on, source)
);
```

* **Ingestion job** (cron `15 16 * * 1-5` UTC for ECB, configurable per source) fetches the
  provider feed, validates it (no rate moves > 15 % day-on-day without manual approval; no
  missing majors), stores raw payload in object storage for evidence, and inserts rows. Weekends
  and holidays carry forward the last business day's rate **at read time** (no synthetic rows).
* **Lookup rule:** `rate(type, from, to, date)` returns the row with the greatest
  `effective_on ≤ date`, preferring `is_override` rows, then a tenant-configured source priority.
  Staleness > 5 business days raises `WARN_FX_STALE` and blocks auto-posting.
* **Monthly average** (`AVERAGE_M`) = arithmetic mean of daily SPOT for business days in the month,
  computed at month end and frozen.

#### 1.3.3 Triangulation

When no direct pair exists, convert through a pivot (tenant setting, default USD, fallback EUR):

```
rate(A→B) = rate(A→P) × rate(P→B)
rate(A→P) = 1 / rate(P→A)            if only the inverse is quoted
```

The full-precision product is used; **round only the final base amount**, never the
intermediate rate. The resolved path (`A→USD→B`, both component rates and their dates) is stored
on the line in `fx_rate_path JSONB` for audit. For historical documents, triangulation uses the
component rates **as of the document date**, never today's.

#### 1.3.4 Realised and unrealised gains/losses

Notation: an open item (invoice) in TC with remaining amount `R_tc`, booked at rate `r_0`
(carrying rate, updated to the last revaluation rate after each revaluation), settled with
`S_tc` at rate `r_s`.

**Realised (on settlement)** — for a receivable:

```
carrying_fc  = S_tc × r_carry
settled_fc   = S_tc × r_s
realised     = settled_fc − carrying_fc        (> 0 gain, < 0 loss, for an asset)
```

Journal for a EUR 1,000 receivable booked at 300.00 and collected at 305.50:

| Account | Dr (PKR) | Cr (PKR) |
|---|---|---|
| Bank EUR (TC 1,000 @ 305.50) | 305,500.00 | |
| AR control (TC 1,000 @ 300.00) | | 300,000.00 |
| FX realised gain | | 5,500.00 |

For a payable, the sign flips (`realised = carrying_fc − settled_fc`). Partial settlements
apply pro-rata: `carrying_fc` uses the proportion `S_tc / R_tc` of the remaining carrying FC.

**Unrealised (period-end revaluation)** — for every open monetary item and every
foreign-currency bank/cash account at `CLOSING` rate `r_c`:

```
revalued_fc   = R_tc × r_c
adjustment    = revalued_fc − carrying_fc          (asset)
              = carrying_fc − revalued_fc          (liability)
```

* Posted as **one revaluation journal per company per period**, lines grouped by
  (account, currency), with an **auto-reversing** flag dated the first day of the next period
  (§1.4.2). This is the "reverse-and-rebook" method: realised gain at settlement is then always
  measured against the original booking rate, which keeps the arithmetic simple and auditable.
* Alternative "carry-forward" method (update `r_carry` to `r_c`, no reversal) is a tenant
  option; the two MUST NOT be mixed in one company.
* Non-monetary items (inventory, fixed assets, prepaid expenses) are **never** revalued
  (IAS 21 ¶23).

#### 1.3.5 Rounding

* Line base amounts: half-even to 4 dp.
* Presentation: half-even to the currency's minor unit.
* If converting a balanced TC entry produces Σ debit_base ≠ Σ credit_base by ≤ 0.01 × lines,
  the engine adds a line to `FX_ROUNDING` for the residue. Larger differences raise
  `ERR_FX_ROUNDING_EXCEEDED` (signals a bad rate or a bug).

#### 1.3.6 Translation for consolidation (reporting currency)

Assets/liabilities at closing rate; equity at historical rates; P&L at monthly average; the
difference goes to the **cumulative translation adjustment** (CTA) in OCI. Translation is a
reporting computation over `account_balances`, not a posting.

### 1.4 Journal entry lifecycles

#### 1.4.1 State machine (all journal types)

```
            submit            approve (rule-based, §4.2.2 matrix)
  DRAFT ────────────▶ PENDING_APPROVAL ────────────────▶ APPROVED
    ▲  │ discard              │ reject                      │ post (period OPEN, balanced)
    │  ▼                      ▼                             ▼
    │ DISCARDED            REJECTED ──edit──▶ DRAFT       POSTED ──reverse──▶ REVERSED
    │ (soft)                                                 │
    └──────────────────── copy-to-new ◀──────────────────────┘
```

| Transition | Guard | Side effects |
|---|---|---|
| DRAFT → PENDING_APPROVAL | Validation §1.2.5 passes (except period may be future) | Approval tasks created |
| PENDING → APPROVED | Approver ≠ creator (segregation of duties), approver limit ≥ entry amount | Audit |
| APPROVED → POSTED | Period OPEN (or SOFT_CLOSED and user has `post_soft_closed`), still balanced, accounts still active | Number assigned, balances updated, outbox `JournalPosted` |
| POSTED → REVERSED | Reversal entry posted in an OPEN period; original cannot already be reversed | `reversed_by_entry_id` set on original, `reverses_entry_id` on the new one |
| Auto-post sources | Sub-ledgers (invoices, GRNs…) post directly DRAFT → POSTED inside their own transaction; approval happened on the source document | |

#### 1.4.2 Reversing (accrual) journals

* Header fields: `auto_reverse BOOLEAN`, `reverse_on DATE` (default: first day of next period).
* On posting, the engine **schedules** a reversal: `scheduled_jobs(type='REVERSE_ENTRY',
  run_on=reverse_on, entry_id)`. A daily job (and the period-open hook) posts the reversal:
  same lines with debit/credit swapped, same FX rates (so the reversal is exactly zero in base),
  `reverses_entry_id` set, description prefixed `REV:`.
* If `reverse_on` falls in a closed period, the job fails loudly and raises a close-checklist
  item; it never silently re-dates.

#### 1.4.3 Recurring templates

```sql
CREATE TABLE recurring_journals (
  id UUID PRIMARY KEY, tenant_id UUID, company_id UUID,
  name TEXT, rrule TEXT NOT NULL,            -- RFC 5545, e.g. FREQ=MONTHLY;BYMONTHDAY=-1
  start_on DATE, end_on DATE, max_occurrences INT,
  next_run_on DATE NOT NULL,
  amount_mode TEXT CHECK (amount_mode IN ('FIXED','FORMULA','STATISTICAL')),
  post_mode TEXT CHECK (post_mode IN ('DRAFT','AUTO_POST')),
  template JSONB NOT NULL,                   -- lines with combination + amount or formula
  last_generated_entry_id UUID, is_active BOOLEAN
);
```

* Formula mode supports `balance(<account>, <period_offset>)`, `stat(<account>)` and arithmetic,
  evaluated by a sandboxed expression engine (no eval).
* Generation job is idempotent on `(template_id, occurrence_date)` (unique index on generated
  entries), so reruns never double-post.

#### 1.4.4 Inter-company and allocation journals

**Inter-company.** One business event touching companies A and B produces **two linked
entries**, one per company, each balanced on its own, plus a shared `ic_transaction_id`:

| Company A (pays expense for B) | Dr | Cr |
|---|---|---|
| IC due from B | 10,000 | |
| Bank | | 10,000 |

| Company B | Dr | Cr |
|---|---|---|
| Expense | 10,000 | |
| IC due to A | | 10,000 |

Both entries are created in one database transaction (same instance) or via the saga in §7.2
(separate ledgers). An **IC reconciliation report** matches `due_from(A,B)` to `due_to(B,A)` by
`ic_transaction_id`; a non-zero net blocks consolidation. Eliminations are generated at
consolidation, never posted to entity books.

**Allocations** (e.g. rent split by headcount): `allocation_rules(source_combination,
driver: FIXED_PCT | STATISTICAL_ACCOUNT | BALANCE_OF, targets[])`. Run produces one entry:
credit the pool, debit targets by `amount × weight_i / Σweights`, the **last target absorbs the
rounding residue** so the entry balances exactly. Step-down allocation runs rules in a
configured sequence; a rule cannot allocate to an already-closed pool (cycle detection on the
rule graph).

### 1.5 Bank ingestion & advanced reconciliation

#### 1.5.1 Canonical statement model

All formats are parsed into one model before matching:

```ts
interface BankStatement {
  bankAccountId: string; statementId: string; format: "CAMT053" | "MT940" | "OFX" | "CSV";
  openingBalance: Decimal; closingBalance: Decimal; currency: string;
  periodFrom: Date; periodTo: Date;
  lines: BankLine[];
}
interface BankLine {
  externalId: string;           // bank's unique ref, or a deterministic hash (see below)
  bookingDate: Date; valueDate: Date;
  amount: Decimal;              // signed: + credit to our account, − debit
  currency: string;
  counterpartyName?: string; counterpartyIban?: string;
  endToEndId?: string;          // pain.001 / pacs.008 E2E reference
  remittanceInfo?: string;      // unstructured, or structured creditor ref (RF…)
  bankTxCode?: string;          // ISO BTC domain/family/sub-family, e.g. PMNT-RCDT-ESCT
  charges?: Decimal;            // fees split by the bank, if reported
}
```

| Format | Parsing specifics |
|---|---|
| **CAMT.053** (ISO 20022 XML) | XSD-validate (`camt.053.001.02`–`.08`). `Stmt/Bal` with `Tp/CdOrPrtry/Cd` = `OPBD`/`CLBD` for opening/closing. Each `Ntry`: `Amt@Ccy`, `CdtDbtInd` (CRDT/DBIT → sign), `BookgDt`, `ValDt`, `BkTxCd/Domn`, `AcctSvcrRef` (→ externalId). Batched entries: iterate `NtryDtls/TxDtls` and emit one line per `TxDtls` with `Refs/EndToEndId`, `RltdPties/Dbtr|Cdtr/Nm`, `RmtInf/Ustrd|Strd`. `Chrgs/Rcrd` → `charges`. |
| **MT940** (SWIFT text) | Tags: `:20:` ref, `:25:` account, `:28C:` statement no., `:60F:/:60M:` opening, `:61:` line, `:86:` narrative, `:62F:` closing. `:61:` grammar: `YYMMDD[MMDD](C|D|RC|RD)[funds code]amount(N|F|S)XXX(ref)[//bank ref]` — amount uses comma decimal. `:86:` is bank-specific; per-bank sub-field parsers (e.g. `?20`–`?29` remittance, `?32` name, `?31` IBAN for German banks). Multi-message statements joined on `:20:` + `:28C:` sequence. |
| **OFX** (SGML 1.x / XML 2.x) | Normalise SGML (unclosed tags) to XML first. `STMTTRN`: `TRNTYPE`, `DTPOSTED`, `TRNAMT` (signed), `FITID` (externalId), `NAME`, `MEMO`, `CHECKNUM`. `LEDGERBAL`/`AVAILBAL` for closing. |
| **CSV** | Per-bank mapping profile (column map, date format, decimal separator, sign convention, header rows). |

**Integrity checks on import:** `opening + Σ lines = closing` (else reject with
`ERR_STATEMENT_DOES_NOT_FOOT`); opening equals the previous statement's closing (else
`WARN_STATEMENT_GAP`); duplicate lines rejected by `UNIQUE (bank_account_id, external_id)`.
When the bank gives no unique ref, `external_id = sha256(account|bookingDate|amount|ref|name|
ordinal-within-day)`.

#### 1.5.2 Multi-tier matching engine

Candidates on the book side: unreconciled cash-account journal lines, open AR/AP items, expected
deposits, and payment runs. Matching runs tier by tier; a line matched in one tier is removed
from later tiers.

| Tier | Rule | Auto-confirm? |
|---|---|---|
| T0 Rules | User-defined rules on bank lines (regex on narrative, BTC code, counterparty) that **create** entries: bank fees, interest, standing orders | Yes, rules are pre-approved |
| T1 Exact reference | `endToEndId` = our payment's E2E, or structured RF creditor reference = invoice's, or cheque number = issued cheque; **and** amount equal | Yes |
| T2 Exact amount + unique | Same amount, same currency, date within ±3 business days, and exactly one candidate | Yes |
| T3 Fuzzy scored | Score below | ≥ 0.92 auto, 0.75–0.92 suggest, < 0.75 none |
| T4 Many-to-one / one-to-many | Subset-sum: one bank deposit = several receipts (deposit slip), or one invoice paid by several transfers | Suggest only |
| T5 Manual | User picks; can create an adjustment entry inline | — |

**Fuzzy score (T3):**

```
score = 0.40·S_amount + 0.25·S_ref + 0.20·S_name + 0.15·S_date

S_amount = 1                              if |Δ| = 0
         = 1 − |Δ| / tolerance            if |Δ| ≤ tolerance   (tolerance = max(1.00, 0.5 % of amount))
         = 0                              otherwise
S_ref    = max over tokens of normalised Levenshtein similarity between invoice/PO numbers
           extracted from remittance (regex per tenant numbering mask) and candidate doc numbers;
           1.0 on exact token hit
S_name   = Jaro-Winkler(normalise(counterpartyName), normalise(party.legalName | aliases))
           normalise = upper-case, strip legal suffixes (LTD, PVT, LLC, GMBH), punctuation, spaces
S_date   = max(0, 1 − |valueDate − expectedDate| / 10 days)
```

An amount difference inside tolerance is matched with a **write-off line** to a configured
account (small differences, bank charges deducted by the payer) and requires the `S_ref` or
`S_name` component ≥ 0.8.

**Subset-sum (T4)** uses meet-in-the-middle over at most 24 candidates from the same
counterparty and a ±5 business day window, bounded at 50 ms per bank line; beyond that the line
falls through to manual.

#### 1.5.3 Fees, interest, processor deductions, uncleared items

| Item | Detection | Treatment |
|---|---|---|
| Bank fees | BTC `*-CHRG`, `Chrgs` element, T0 regex (`/CHARGES?|COMMISSION|SMS FEE/`) | Auto entry Dr Bank charges / Cr Bank |
| Interest | BTC `*-INTR`, regex | Dr Bank / Cr Interest income (or Dr Interest expense) |
| Card/Stripe payouts | Payout line matched to processor **settlement report** (Stripe `balance_transactions` / payout reconciliation report) | Gross-up: Dr Bank (net) + Dr Processor fees, Cr Undeposited funds / clearing (gross of the underlying charges). Refunds and disputes in the payout become separate lines against AR / chargeback account |
| FX on receipt | Bank line currency ≠ book currency | Realised FX via §1.3.4 |
| Uncleared cheques / deposits in transit | Book items with no bank match at period end | Stay open; listed on the **bank reconciliation statement**: `bank closing + deposits in transit − outstanding cheques ± bank errors = book balance`. Cheques open > 180 days raise a stale-cheque task (reverse to a liability per local law) |
| Unidentified receipts | No match after T5 by period end | Posted to `SUSPENSE`; close checklist blocks until zero |

A reconciliation is **finalised** per bank account per statement date: it stores the
statement closing balance, book balance, the list of reconciling items, and a hash of matched
pairs. Finalised reconciliations are immutable; un-reconciling a matched pair in a finalised
statement requires reopening it (audited, permission `reopen_bank_rec`).

---

## 2. Enterprise inventory, costing & value tracking

### 2.1 Costing engines

#### 2.1.1 Shared foundations

* **`inventory_ledger` is the single source of truth** for quantity and value (§8.1). Every
  movement is an append-only row with signed `qty` (base unit of measure) and signed `value_base`.
  On-hand at any date = `Σ qty WHERE movement_date ≤ date`; stock value = `Σ value_base`.
* **Valuation key** = `(company_id, item_id, valuation_scope)` where `valuation_scope` is a tenant
  setting: `COMPANY` (one cost pool across warehouses) or `WAREHOUSE` (pool per warehouse). Lot-
  or serial-tracked items MAY use `SPECIFIC_IDENTIFICATION` (§2.1.5), which is what the
  dealership uses: each vehicle is its own cost pool.
* Costing method is set per item (`items.costing_method ∈ {FIFO, MAC, STANDARD, SPECIFIC}`) and
  can only change at a period boundary via a **costing method change** document that revalues
  the closing stock (posted to `INVENTORY_ADJUSTMENT` / `PPV`, audited).
* **Unit of measure:** quantities are stored in the item's base UoM. `uom_conversions(item_id,
  from_uom, to_uom, factor NUMERIC(20,10))`; documents store entered qty + UoM and the converted
  base qty. Rounding of base qty follows `uom.precision` (e.g. `PCS` 0 dp, `KG` 3 dp).
* **Ordering key** for a valuation key is `(movement_date, sequence_class, created_at, id)`.
  `sequence_class` makes same-day ordering deterministic: receipts (10) before transfers-in (20)
  before production output (30) before issues (40) before adjustments (50).

#### 2.1.2 FIFO

**Data structures**

```sql
CREATE TABLE cost_layers (
  id              UUID PRIMARY KEY,
  valuation_key   UUID NOT NULL,               -- FK to valuation_keys(company,item,scope)
  source_ledger_id UUID NOT NULL REFERENCES inventory_ledger(id),
  layer_date      DATE NOT NULL,
  seq             BIGINT NOT NULL,             -- ordering key, monotonically assigned
  qty_in          NUMERIC(20,4) NOT NULL CHECK (qty_in > 0),
  qty_remaining   NUMERIC(20,4) NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_in),
  unit_cost       NUMERIC(20,6) NOT NULL,      -- 6 dp: unit costs need more precision than totals
  value_in        NUMERIC(20,4) NOT NULL,      -- authoritative; unit_cost is value_in / qty_in
  value_remaining NUMERIC(20,4) NOT NULL,
  lot_id          UUID,                        -- set when FIFO-by-lot
  is_open         BOOLEAN GENERATED ALWAYS AS (qty_remaining > 0) STORED
);
CREATE INDEX cost_layers_open ON cost_layers (valuation_key, seq) WHERE is_open;

CREATE TABLE cost_consumptions (               -- which layer fed which issue
  id              UUID PRIMARY KEY,
  issue_ledger_id UUID NOT NULL REFERENCES inventory_ledger(id),
  layer_id        UUID NOT NULL REFERENCES cost_layers(id),
  qty             NUMERIC(20,4) NOT NULL CHECK (qty > 0),
  value           NUMERIC(20,4) NOT NULL
);
```

Storing `value_remaining` (not just `qty × unit_cost`) is what keeps totals exact: the last unit
taken from a layer gets `value_remaining` itself, absorbing the rounding residue, so a fully
consumed layer always releases exactly `value_in`.

**Receipt (in-sequence)**

```
on receipt(qty q > 0, value v):
  insert cost_layer(qty_in=q, qty_remaining=q, value_in=v, value_remaining=v, seq=next_seq())
  if negative_backlog(valuation_key) exists: settle_negative_backlog(layer)   -- see below
```

**Issue (in-sequence)**

```
on issue(qty q > 0):
  remaining = q; total = 0
  for layer in open layers of key ORDER BY seq FOR UPDATE:      -- row locks, §7.1
     take = min(remaining, layer.qty_remaining)
     val  = (take == layer.qty_remaining) ? layer.value_remaining
                                          : round_half_even(take * layer.value_remaining / layer.qty_remaining, 4)
     layer.qty_remaining  -= take
     layer.value_remaining -= val
     insert cost_consumption(issue, layer, take, val)
     total += val; remaining -= take
     if remaining == 0: break
  if remaining > 0:
     if item.allow_negative_stock == false: raise ERR_INSUFFICIENT_STOCK
     else: record negative backlog (remaining) valued at last known unit cost,
           flagged PROVISIONAL; settled when the next receipt arrives
  ledger.value_base = -total
```

**Backdated transactions and corrections.** A movement whose ordering key is earlier than the
latest processed movement for the same valuation key invalidates every consumption after it.
The engine re-costs from the **rewind point**:

```
recost(valuation_key, from_seq):
  lock valuation_key row FOR UPDATE                               -- serialises re-costers
  affected = movements of key WHERE seq >= from_seq ORDER BY seq
  -- 1. undo
  for each issue in affected: restore its consumptions to their layers, delete consumptions
       (consumptions are derived data: deletable; the inventory_ledger rows are not)
  delete layers created by receipts in affected   (they will be recreated)
  -- 2. replay
  for each movement in affected (ordered): apply receipt/issue algorithm above
  -- 3. revalue
  for each issue whose recomputed value differs from its posted value_base:
       write an inventory_ledger REVALUATION row (qty 0, value = new − old,
             dated on the ORIGINAL movement date if its period is OPEN,
             otherwise dated the first day of the first OPEN period)  -- §5.3
       post GL: Dr/Cr COGS (or WIP / transfer target) vs Inventory asset for the delta
```

Rules that keep this tractable:

1. Posted inventory ledger rows are **never edited**; changes arrive as revaluation rows. The
   audit trail shows the original cost and every adjustment.
2. Re-costing is asynchronous for large rewinds (> 5,000 movements): the backdated document is
   posted with provisional cost; a `RecostRequested(valuation_key, from_seq)` job runs within
   minutes; reports show a "costs pending" banner for the key until done. Coalescing: multiple
   requests for the same key keep the minimum `from_seq`.
3. Rewinds into closed periods are refused (`ERR_PERIOD_CLOSED`) unless the user posts a
   prior-period adjustment (§5.3.4), which is dated in the current period by design.
4. **Correcting a past error** (wrong receipt cost): post a *cost correction* document against
   the original receipt. It changes the layer's `value_in` via a revaluation row and triggers
   `recost` from that layer's `seq`. Consumptions that already took units from that layer are
   revalued proportionally.

#### 2.1.3 Moving average cost (MAC)

State per valuation key: `(qty_on_hand Q, value_on_hand V)`; `MAC = V / Q`.

**On every GRN posting** (or any valued receipt) of quantity `q` at value `v`:

```
if Q >= 0:
    Q' = Q + q
    V' = V + v
else:                                    -- receiving into negative stock
    covered   = min(q, −Q)               -- units that cancel the negative balance
    -- the negative units were issued at the old MAC; the receipt values them at the new cost
    variance  = covered × (v/q) − covered × MAC_old
    post variance to COGS (or PPV by policy) — it belongs to the issues already made
    Q' = Q + q
    V' = V + v − variance  (= Q' × (v/q) when Q' > 0)
MAC' = (Q' > 0) ? V' / Q' : MAC_old     -- keep last MAC when stock is zero
```

Worked example: `Q = 100, V = 1,000.00 (MAC 10.00)`. GRN 50 @ 13.00 (`v = 650.00`) →
`Q' = 150, V' = 1,650.00, MAC' = 11.0000`. Issue 30 → value `30 × 11.0000 = 330.00`, so
`Q = 120, V = 1,320.00`.

**On issue** of `q`: `value = round_half_even(q × V / Q, 4)`; if `q == Q`, value = `V` exactly
(residue absorbed, value never drifts away from zero when stock does).

**Backdated receipts under MAC** follow the same rewind-and-replay as FIFO, using the running
`(Q, V)` snapshot stored on each ledger row (`running_qty`, `running_value`) as the restart
point, which makes replay O(movements since rewind point).

**Invoice price differs from GRN price** (MAC): if the stock is still on hand, the difference
goes into `V` (MAC moves); for the portion already issued, the difference goes to COGS/PPV:
`to_stock = Δ × min(1, Q_now / q_received)`; `to_cogs = Δ − to_stock`.

#### 2.1.4 Standard cost (for manufactured items)

Inventory moves at `standard_cost`; differences go to variance accounts: purchase price variance
(`(actual − standard) × qty` at invoice), material usage, labour rate/efficiency, overhead
spending/volume (§3.1.4). Standards roll up annually via a **cost roll** on the BOM tree and
revalue on-hand stock at roll date.

#### 2.1.5 Specific identification (serial/vehicle level)

Each serial is a valuation key of quantity one. Cost = purchase + capitalised costs (landed cost,
reconditioning — exactly what the dealership `Vehicle.recon[]` models). Sale relieves the whole
pool. No averaging, no layers.

### 2.2 Landed cost allocation engine

#### 2.2.1 Flow

```
Freight / duty / insurance bill (AP)  ──▶  Dr LANDED_COST_CLEARING / Cr AP
                                              │
Landed-cost voucher (links bill lines to GRN lines or a shipment) │ allocate
                                              ▼
           for each target receipt line i: Δv_i = allocation_i
           Dr Inventory asset (for qty still on hand)
           Dr COGS            (for qty already issued, pro-rata)
           Cr LANDED_COST_CLEARING  (exactly the bill amount)
```

* Charge types: `FREIGHT`, `INSURANCE`, `CUSTOMS_DUTY`, `TARIFF`, `BROKERAGE`, `PORT_HANDLING`,
  `INLAND_HAUL`. Each has a default allocation basis and a **capitalisable flag**: recoverable
  import VAT/GST is *not* capitalised (it goes to input tax); non-recoverable duties are.
* Estimates: a PO can carry **estimated** landed cost so the GRN is valued at estimated landed
  cost; when actual bills arrive, the difference is allocated the same way (actual − estimate).
* `LANDED_COST_CLEARING` MUST be zero per closed shipment; non-zero balances older than 60 days
  appear on the close checklist.

#### 2.2.2 Allocation formulas

For a charge `C` allocated across target lines `i = 1..n`:

| Basis | Weight `w_i` |
|---|---|
| Value-proportional | `w_i = qty_i × unit_price_i` (in base currency at GRN rate) |
| Weight-proportional | `w_i = qty_i × gross_weight_kg_i` |
| Volume-proportional | `w_i = qty_i × volume_m3_i` |
| Quantity | `w_i = qty_i` |
| Duty by HS code | `w_i = customs_value_i × duty_rate(hs_code_i)` (duty is recalculated, not apportioned, when the broker gives per-line duty) |
| Manual | Entered amounts, must sum to `C` |

```
alloc_i = round_half_even(C × w_i / Σ w, 4)      for i = 1..n−1
alloc_n = C − Σ_{i<n} alloc_i                    -- largest-weight line absorbs residue
                                                 -- (sort by w desc, put largest last)
unit landed cost increment_i = alloc_i / qty_i   (6 dp)
```

**Worked example** — freight PKR 90,000 on a shipment of two items:

| Line | Qty | Unit price | Value | Unit weight | Total weight | Value basis | Weight basis |
|---|---|---|---|---|---|---|---|
| A | 100 | 2,000 | 200,000 | 2 kg | 200 kg | 90,000 × 200k/500k = **36,000** | 90,000 × 200/1,100 = **16,363.6364** |
| B | 50 | 6,000 | 300,000 | 18 kg | 900 kg | 90,000 × 300k/500k = **54,000** | 90,000 − 16,363.6364 = **73,636.3636** |

Weight basis is right for bulky low-value goods (freight is charged by weight); value basis for
insurance and ad valorem duty. Each charge line chooses its own basis, so one voucher can mix
them.

#### 2.2.3 Effect on costing engines

* **FIFO:** increase the receipt layer's `value_in` and `value_remaining` by
  `alloc_i × (qty_remaining / qty_in)`; the consumed share is revalued to COGS through
  consumption records (§2.1.2 correction path). No full re-cost needed unless the layer is fully
  consumed and its issues are in a closed period.
* **MAC:** `V += alloc_i × min(1, Q_now / qty_i)`, remainder to COGS (same as invoice
  variance).
* **Specific ID:** add to the unit's cost pool.

### 2.3 Stock movement matrix (ledger impacts)

`INV` = inventory asset account of the item category, `C` = cost value of the movement.
All rows produce one `inventory_ledger` row per (item, warehouse, lot/serial) and the GL entry
shown, in the same transaction.

| # | Movement | `inventory_ledger` | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 1 | GRN (purchase receipt) | +qty, +C (PO price × rate, + estimated landed cost) | INV | GRNI (+ LANDED_COST_CLEARING for estimates) | AP not touched yet |
| 2 | Supplier invoice matched to GRN | — (value adj if price differs) | GRNI (GRN value); INV or PPV/COGS for price diff; TAX_INPUT | AP | §4.2.4 three-way match |
| 3 | Direct purchase (no GRN, e.g. dealership vehicle buy) | +1, +C | INV | AP / Bank | |
| 4 | Sales shipment (delivery note) | −qty, −C | COGS | INV | Revenue recognised at invoice or shipment per policy (§4.1.4) |
| 5 | Sales invoice | — | AR | Revenue, TAX_OUTPUT | If invoiced before shipment: Cr Unearned revenue / Contract liability until shipped |
| 6 | Transfer — ship (2-step) | From WH: −qty, −C; In-transit pseudo-WH: +qty, +C | STOCK_IN_TRANSIT | INV (from) | Value moves at source cost |
| 7 | Transfer — receive | In-transit: −qty, −C; To WH: +qty, +C | INV (to) | STOCK_IN_TRANSIT | Short receipt: difference → INVENTORY_ADJUSTMENT (shrinkage in transit) with reason code |
| 8 | Transfer — 1-step (same site) | −/+ at same cost | INV (to) | INV (from) | Only when both warehouses share an INV account: no GL entry |
| 9 | Count — shrinkage / loss | −qty, −C | INVENTORY_ADJUSTMENT (shrinkage) | INV | Reason codes: `SHRINK`, `THEFT`, `DAMAGE`, `EXPIRED`, `COUNT_ERR` → separate sub-accounts |
| 10 | Count — gain | +qty, +C (at current MAC / last FIFO cost) | INV | INVENTORY_ADJUSTMENT (gain) | |
| 11 | Write-down to NRV (IAS 2 ¶28) | qty 0, −Δvalue (REVALUATION row) | Inventory write-down expense | INV (or allowance contra-account) | Lower of cost and net realisable value review at period end |
| 12 | Scrap from damage | −qty, −C | Scrap/damage expense | INV | Salvage value: Dr Scrap inventory |
| 13 | Customer return — resaleable (RMA) | +qty, +C (at **original issue cost** from the shipment's consumption records) | INV | COGS | Credit note side: Dr Revenue + TAX_OUTPUT / Cr AR |
| 14 | Customer return — damaged | +qty into `QUARANTINE` WH, then #12 | INV (quarantine) → expense | COGS | |
| 15 | Return to supplier | −qty, −C (original layer cost when identifiable) | GRNI (if not invoiced) / AP (debit note) | INV | Price diff vs. current cost → PPV |
| 16 | Consignment **in** (we hold supplier's goods) | qty tracked in `ownership = SUPPLIER` bucket, value 0 | — | — | No asset. On sale/consumption: create a purchase: Dr COGS / Cr AP at agreed price |
| 17 | Consignment **out** (our goods at customer/agent) | Transfer to consignee WH (`ownership = OURS`, location external) | INV (consignment) | INV | On consignee's sales report: #4 + #5 |
| 18 | Production issue (backflush) | −qty components | WIP | INV | §3.1.2 |
| 19 | Production receipt | +qty finished goods at standard/actual | INV (FG) | WIP | Variances §3.1.4 |
| 20 | Internal consumption (stationery, demo vehicle) | −qty, −C | Expense / Fixed asset (if capitalised) | INV | |
| 21 | Landed cost allocation | qty 0, +Δvalue on receipt layers | INV (+ COGS for consumed share) | LANDED_COST_CLEARING | §2.2 |
| 22 | Trade-in vehicle received (dealership) | +1, +allowance | INV | Customer AR / deal clearing (non-cash consideration) | §4.1.6 |

**Ownership and stock status buckets.** On-hand is broken down by
`(warehouse, bin, ownership ∈ {OURS, SUPPLIER_CONSIGNMENT, CUSTOMER_OWNED}, status ∈
{AVAILABLE, QUALITY_HOLD, QUARANTINE, DAMAGED, RESERVED_FOR_PROD, IN_TRANSIT})`. Only
`OURS + AVAILABLE` counts toward ATP (§4.1.2). Status changes are zero-value ledger rows
(`STATUS_CHANGE`) so history stays complete.

### 2.4 Granular traceability

#### 2.4.1 Batch / lot tracking

```sql
CREATE TABLE lots (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  item_id            UUID NOT NULL REFERENCES items(id),
  lot_number         TEXT NOT NULL,
  supplier_lot_number TEXT,
  manufactured_on    DATE,
  received_on        DATE NOT NULL,
  expires_on         DATE,
  best_before_on     DATE,
  retest_on          DATE,
  origin_country     CHAR(2),
  status             TEXT NOT NULL DEFAULT 'RELEASED'
                     CHECK (status IN ('QUARANTINE','RELEASED','ON_HOLD','RECALLED','EXPIRED','CONSUMED')),
  attributes         JSONB NOT NULL DEFAULT '{}',   -- potency, grade, colour batch…
  parent_lot_ids     UUID[] NOT NULL DEFAULT '{}',  -- genealogy for manufactured lots
  UNIQUE (tenant_id, item_id, lot_number),
  CHECK (expires_on IS NULL OR manufactured_on IS NULL OR expires_on > manufactured_on)
);
CREATE INDEX lots_expiry ON lots (tenant_id, expires_on) WHERE status IN ('RELEASED','ON_HOLD');
```

Validation layers:

| Layer | Rule |
|---|---|
| Item | `items.tracking ∈ {NONE, LOT, SERIAL, LOT_AND_SERIAL}`; LOT items require `lot_id` on every ledger row (`CHECK` via trigger joining items) |
| Receipt | Lot number required; expiry required when `items.shelf_life_days` is set; computed default `expires_on = manufactured_on + shelf_life_days` |
| Receipt guard | Reject if remaining shelf life `< items.min_receipt_shelf_life_pct` (e.g. 70 %) unless overridden with reason |
| Issue picking | Strategy per item: `FEFO` (first-expired-first-out, default for perishables), `FIFO` by received date, or `MANUAL`. Picking excludes lots with status ≠ RELEASED and lots whose remaining shelf life at **customer delivery date** is below the customer's `min_shelf_life_days` |
| Expiry | Daily job: `expires_on < today` → status `EXPIRED` + zero-value status-change rows moving stock to `QUARANTINE`; write-off proposal created |

**Shelf-life alert model.** For each lot with on-hand > 0:
`remaining_pct = (expires_on − today) / (expires_on − manufactured_on)`. Alert levels:
`WATCH` ≤ 50 %, `ACTION` ≤ 25 % (suggest markdown/transfer to faster-moving location),
`CRITICAL` ≤ 10 % or ≤ 7 days. Alerts are idempotent per (lot, level) and roll up to a daily
digest.

**Recall workflow.**

```
RecallCase(DRAFT) ─open─▶ OPEN ─containment─▶ CONTAINED ─notify─▶ NOTIFIED ─close─▶ CLOSED
```

1. **Scope:** user enters affected lot(s). The engine computes the **genealogy closure**:
   forward trace (lots produced from these lots, recursively via `parent_lot_ids` / production
   consumption) and backward trace (supplier lots that fed them). Recursive CTE:

   ```sql
   WITH RECURSIVE fwd AS (
     SELECT id FROM lots WHERE id = ANY($1)
     UNION
     SELECT l.id FROM lots l JOIN fwd ON fwd.id = ANY(l.parent_lot_ids)
   ) SELECT * FROM fwd;
   ```
2. **Containment:** every on-hand quantity of affected lots is moved to status `ON_HOLD`
   (zero-value rows); open sales order allocations of those lots are released and flagged.
3. **Customer exposure:** all shipments of affected lots → customer list with quantities,
   ship dates, contact; generates RMAs or notification letters in bulk.
4. **Closure:** requires disposition of every unit (returned, destroyed, released after test)
   with evidence attachments.

#### 2.4.2 Serial number tracking

```sql
CREATE TABLE serials (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  item_id         UUID NOT NULL REFERENCES items(id),
  serial_number   TEXT NOT NULL,              -- VIN for vehicles (17 chars, ISO 3779)
  lot_id          UUID REFERENCES lots(id),
  status          TEXT NOT NULL CHECK (status IN
                  ('EXPECTED','IN_STOCK','RESERVED','IN_TRANSIT','SHIPPED','RETURNED',
                   'IN_REPAIR','SCRAPPED','CONSUMED')),
  warehouse_id    UUID REFERENCES warehouses(id),
  bin_id          UUID,
  ownership       TEXT NOT NULL DEFAULT 'OURS',
  received_ledger_id UUID REFERENCES inventory_ledger(id),
  shipped_ledger_id  UUID REFERENCES inventory_ledger(id),
  customer_id     UUID,
  warranty_starts_on DATE,
  warranty_ends_on   DATE,
  unit_cost       NUMERIC(20,4),              -- for SPECIFIC costing
  attributes      JSONB NOT NULL DEFAULT '{}',-- engine no, colour, odometer at intake…
  version         INT NOT NULL DEFAULT 0,     -- optimistic lock
  UNIQUE (tenant_id, item_id, serial_number)
);
CREATE TABLE serial_events (                  -- append-only lifecycle
  id UUID PRIMARY KEY, serial_id UUID NOT NULL REFERENCES serials(id),
  event TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
  ledger_id UUID, document_type TEXT, document_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL, actor_id UUID, payload JSONB
);
```

**Lifecycle state machine and guards**

| From | Event | To | Guard |
|---|---|---|---|
| — / EXPECTED | Receive (GRN) | IN_STOCK | Serial not already IN_STOCK anywhere in tenant (unique + status check); format regex per item (`items.serial_pattern`, VIN check digit for vehicles) |
| IN_STOCK | Allocate | RESERVED | One allocation per serial (`UNIQUE (serial_id) WHERE active` on allocations) |
| RESERVED | Release | IN_STOCK | |
| IN_STOCK / RESERVED | Transfer ship | IN_TRANSIT | |
| IN_TRANSIT | Transfer receive | IN_STOCK | Receiving warehouse = destination |
| RESERVED / IN_STOCK | Ship | SHIPPED | Ledger row count for serial: exactly one outbound per inbound; sets `customer_id`, warranty dates (`ship_date + items.warranty_months`) |
| SHIPPED | RMA receive | RETURNED | RMA lines list the serial; serial's customer = RMA customer |
| RETURNED | Inspect OK | IN_STOCK | |
| RETURNED / SHIPPED | Warranty repair in | IN_REPAIR | Warranty check: `today ≤ warranty_ends_on` → no-charge service order, else billable |
| IN_REPAIR | Repair out | SHIPPED | |
| any in-house | Scrap | SCRAPPED | Zero on-hand afterwards |
| IN_STOCK | Production consume | CONSUMED | Recorded in parent serial genealogy |

Every transition writes `serial_events` and updates `serials.status` with
`UPDATE … WHERE id = $1 AND version = $v` (optimistic concurrency); 0 rows updated →
`ERR_SERIAL_CONCURRENT_CHANGE`, retry by reloading. A nightly integrity check asserts that
`count(serials WHERE status IN ('IN_STOCK','RESERVED') AND item = X AND warehouse = W)` equals
`Σ inventory_ledger.qty` for that item/warehouse.

---

## 3. Advanced supply chain: manufacture, assembly & reordering

### 3.1 Bill of materials & kitting

#### 3.1.1 Schema

```sql
CREATE TABLE boms (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id),       -- the parent (finished/sub-assembly)
  revision TEXT NOT NULL,                           -- A, B, C…
  bom_type TEXT NOT NULL CHECK (bom_type IN ('MANUFACTURE','KIT','PHANTOM','DISASSEMBLY')),
  base_qty NUMERIC(20,4) NOT NULL DEFAULT 1 CHECK (base_qty > 0),   -- lines are per base_qty
  status TEXT NOT NULL CHECK (status IN ('DRAFT','ACTIVE','OBSOLETE')),
  effective_from DATE NOT NULL, effective_to DATE,
  routing_id UUID,
  UNIQUE (tenant_id, item_id, revision),
  EXCLUDE USING gist (item_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&)
    WHERE (status = 'ACTIVE')                       -- no overlapping active revisions
);
CREATE TABLE bom_lines (
  id UUID PRIMARY KEY, bom_id UUID NOT NULL REFERENCES boms(id),
  line_no INT NOT NULL,
  component_item_id UUID NOT NULL REFERENCES items(id),
  qty_per NUMERIC(20,6) NOT NULL CHECK (qty_per > 0),
  uom TEXT NOT NULL,
  scrap_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 100),   -- component scrap
  fixed_qty BOOLEAN NOT NULL DEFAULT false,        -- setup material, not scaled by order qty
  operation_seq INT,                               -- which routing step consumes it
  issue_method TEXT NOT NULL DEFAULT 'BACKFLUSH' CHECK (issue_method IN ('BACKFLUSH','MANUAL','PHANTOM')),
  is_by_product BOOLEAN NOT NULL DEFAULT false,    -- negative requirement: co/by-products
  UNIQUE (bom_id, line_no)
);
```

* **Cycle prevention:** on activating a BOM, run a recursive CTE from the parent through all
  active component BOMs; if the parent reappears, reject `ERR_BOM_CYCLE`.
* **Low-level code (LLC):** each item's deepest level in any BOM, recomputed on BOM activation;
  MRP processes items in LLC order so a component's gross requirement includes all parents.
* **Phantom** sub-assemblies are exploded through (their components are issued directly; the
  phantom is never stocked). **Kits** are sold as one SKU and exploded at shipment (component
  stock relieved, kit price allocated across components by standalone selling price for
  revenue reporting when required by IFRS 15).

#### 3.1.2 Requirement explosion with scrap

For a production order of quantity `Q` (parent yield `y_parent`, from routing, default 100 %):

```
planned_input_parent = Q / y_parent
component requirement r_c = fixed_qty ? qty_per
                                      : (planned_input_parent / base_qty) × qty_per / (1 − scrap_pct/100)
```

Note the divisor `(1 − s)`, not the multiplier `(1 + s)`: to end with `n` good units after losing
`s` %, you must start with `n / (1 − s)`. At 10 % scrap: `100 / 0.9 = 111.11`, whereas
`100 × 1.1 = 110` would leave you 1 unit short. Multi-level explosion multiplies down the tree
and rounds up each component to its UoM precision.

#### 3.1.3 Production order lifecycle & WIP accounting

```
PLANNED ─firm─▶ FIRMED ─release─▶ RELEASED ─start─▶ IN_PROGRESS ─report─▶ PARTIALLY_COMPLETE
                                                                            │
                                         COMPLETED ◀───────────────────────┘
                                             │ close (variance calc)
                                             ▼
                                          CLOSED
```

| Event | Inventory ledger | GL |
|---|---|---|
| Release | Soft allocation of components (no ledger rows) | — |
| Manual issue / backflush of components | −qty components at their cost (FIFO/MAC) | Dr WIP (order sub-account) / Cr INV (RM) |
| Labour reporting | — | Dr WIP / Cr Applied labour (rate × hours) |
| Overhead absorption | — | Dr WIP / Cr Applied overhead (rate × driver: machine hours, labour hours) |
| Scrap reported at operation | −qty scrapped component/WIP (already in WIP, so value stays) | No entry until close; scrap value is part of variance |
| Finished goods receipt | +qty FG | Dr INV (FG) at standard (or actual-to-date ÷ qty for actual costing) / Cr WIP |
| By-product receipt | +qty by-product at its NRV | Dr INV (by-product) / Cr WIP |
| Close | — | Remaining WIP balance → variances (below) |

**Backflush** triggers: on operation completion (components with `operation_seq` = that
operation) or on FG receipt (all remaining backflush components), quantity =
`r_c × reported_good_qty / Q`. If a backflush would drive stock negative and the item disallows
negative stock, the FG receipt fails with a component shortage list; the order stays
`IN_PROGRESS`.

#### 3.1.4 Variance decomposition at close (standard costing)

Let `SQ` = standard quantity allowed for actual output, `AQ` = actual quantity used, `SP`/`AP`
standard/actual price, `SH`/`AH` standard/actual hours, `SR`/`AR` standard/actual rate.

| Variance | Formula | Account |
|---|---|---|
| Material price (at purchase, usually) | `(AP − SP) × AQ_purchased` | PPV |
| Material usage | `(AQ − SQ) × SP` | Material usage variance |
| Scrap | `(scrap_actual − scrap_standard) × SP` | Scrap variance |
| Labour rate | `(AR − SR) × AH` | Labour rate variance |
| Labour efficiency | `(AH − SH) × SR` | Labour efficiency variance |
| Overhead spending / volume | Standard formulas on budgeted vs applied | Overhead variances |
| Residual | `WIP balance − Σ above` (rounding) | Production variance — must be < tolerance |

After close, the order's WIP sub-account balance MUST be exactly zero (assertion in the close
transaction).

### 3.2 Dynamic reorder & demand forecasting

#### 3.2.1 Demand statistics

Per (item, warehouse), from **unconstrained demand** (shipped + lost sales from stock-outs +
backorders, excluding one-off bulk orders flagged `is_exceptional`):

* Daily demand series `d_t` over a trailing window (default 365 days).
* Forecast `D̄` (mean daily demand): method chosen per item by back-testing MAPE on a holdout of
  the last 8 weeks — **Simple exponential smoothing** for stable items, **Holt-Winters** for
  trend/seasonality (weekly and annual seasonal periods), **Croston/SBA** for intermittent demand
  (more than 30 % zero days). α, β, γ fitted by minimising SSE; re-fitted weekly.
* `σ_d` = standard deviation of daily forecast error (not of raw demand), so trend is not
  mistaken for volatility.
* Lead time `L̄` (days) and `σ_L` from actual supplier history: `GRN date − PO approval date`
  per supplier-item, trailing 12 months, falling back to the supplier's quoted lead time.

#### 3.2.2 Formulas

| Quantity | Formula |
|---|---|
| Lead-time demand | `LTD = D̄ × L̄` |
| Safety stock (demand and lead-time variability) | `SS = z × √( L̄ × σ_d² + D̄² × σ_L² )` |
| Service-level factor | `z = Φ⁻¹(CSL)`; CSL by ABC class: A = 0.98 (z 2.054), B = 0.95 (1.645), C = 0.90 (1.282) |
| Reorder point | `ROP = LTD + SS` |
| Review-period variant (periodic review every R days) | `SS = z × √( (L̄ + R) σ_d² + D̄² σ_L² )`; order-up-to `S = D̄ (L̄ + R) + SS` |
| Economic order quantity | `EOQ = √( 2 × D_annual × S_order / H )`, `H = unit_cost × carrying_rate` (default 25 %/yr) |
| Inventory position | `IP = on_hand_available + on_order (open PO qty not yet received) + in_transit_to_this_wh − allocated − backorders` |

**Order quantity** when `IP ≤ ROP`:

```
need      = max(ROP + EOQ − IP, ROP − IP + 1)         -- reach at least ROP + EOQ
qty       = max(need, MOQ)
qty       = ceil(qty / order_multiple) × order_multiple   -- pack size / case qty
qty       = min(qty, max_stock − IP)                  -- respect max level if set
if supplier has price breaks: evaluate total cost (purchase + holding + ordering) at each
   break quantity ≥ qty and choose the minimum (EOQ with quantity discounts)
```

**Dynamic** means `D̄`, `σ_d`, `L̄`, `σ_L`, and therefore `SS`/`ROP`, are recomputed nightly and
stored in `replenishment_params(item_id, warehouse_id, computed_at, …)` with history, so a
planner can see why a reorder point moved. Manual overrides carry an expiry date.

#### 3.2.3 Replenishment job

```
cron: 0 2 * * *   (tenant-local 02:00), plus on-demand
for each tenant (sharded across workers, advisory lock per tenant):
  pg_try_advisory_lock(hash('replenish', tenant_id)) or skip   -- no double runs
  recompute params for items with movements since last run (incremental)
  candidates = items WHERE replenishment_method = 'ROP' AND IP <= ROP
  group candidates by preferred supplier (items.supplier_items with rank 1, active, not blocked)
  for each supplier group:
     if a DRAFT auto-PO for (supplier, warehouse) exists: merge lines (update qty)  -- idempotent
     else create PO(status = DRAFT, origin = AUTO_REPLENISH, run_id)
     line expected date = today + supplier lead time (business days, supplier calendar)
     if order total < supplier.min_order_value: flag PO 'BELOW_MIN_VALUE' (do not auto-submit)
  transfer-first rule: before buying, if another warehouse has stock above its max level,
     create a DRAFT transfer order instead of a PO line
  notify buyers (digest); auto-submit only when tenant enables it AND total < auto_approve_limit
  release advisory lock; write run summary to replenishment_runs
```

Exceptions surfaced on the planner dashboard: items below safety stock, items with no supplier,
negative IP, forecast error MAPE > 50 %, supplier lead time drifting > 30 % from quoted.

---

## 4. Order-to-cash (O2C) & procure-to-pay (P2P)

Every commercial document follows one pattern: **header + lines, a state machine, and an
immutable posted form**. Edits after posting happen through follow-on documents (credit note,
debit note, amendment), never by mutating the posted one. Each line carries a `source_line_id`
pointing back to the upstream document line, which makes quantity flow traceable:
`quote_line → so_line → delivery_line → invoice_line → credit_note_line`.

### 4.1 O2C state machine

```
QUOTE ──accept──▶ SALES ORDER ──allocate──▶ PICK ──pack──▶ SHIP (Delivery Note) ──▶ INVOICE ──▶ RECEIPT ──▶ BANK DEPOSIT
  │ expire/lose       │ hold/cancel                 short-pick ↺       partial ↺         partial ↺     unapplied ↺
```

#### 4.1.1 Sales quote

| Item | Rule |
|---|---|
| States | `DRAFT → SENT → ACCEPTED / REJECTED / EXPIRED`; `REVISED` creates `revision + 1` and supersedes the old one |
| Pricing | Price list (customer → group → default) by effective date, then quantity breaks, then contract price; discount above `user.max_discount_pct` puts the quote in `PENDING_APPROVAL` |
| Margin guard | `line_margin = (net_price − current_cost) / net_price`; below `item_category.min_margin_pct` needs approval (same rule as the dealership floor price) |
| Validity | `valid_until`; a nightly job flips to `EXPIRED`; accepting an expired quote re-prices it |
| GL | None |

#### 4.1.2 Sales order — allocated vs available stock

Quantities per (item, warehouse), all derived from `inventory_ledger` plus open documents:

```
on_hand        = Σ inventory_ledger.qty   (ownership = OURS, status = AVAILABLE)
allocated      = Σ open allocations (hard reservations against specific stock/lots/serials)
available      = on_hand − allocated
ATP(date)      = available + Σ scheduled receipts ≤ date − Σ unallocated committed demand ≤ date
```

| Step | Validation |
|---|---|
| Create | Customer active, not on credit hold; ship-to address valid; tax determination (§5.1) runs per line |
| Credit check | `exposure = open AR + uninvoiced shipped value + open SO value (this one included)`; if `exposure > credit_limit` or any invoice is > `overdue_days_block` overdue → `CREDIT_HOLD`, released only by a user with `release_credit_hold` |
| Allocate | Per line: `allocation_policy ∈ {ON_CONFIRM, ON_RELEASE_TO_WAREHOUSE, MANUAL}`. Allocation inserts `stock_allocations(so_line_id, item, warehouse, lot_id?, serial_id?, qty)` under the locking protocol in §7.1. Shortfall → line status `BACKORDERED` for the remainder, with a promise date from ATP |
| States | `DRAFT → CONFIRMED → (CREDIT_HOLD) → RELEASED → PARTIALLY_SHIPPED → SHIPPED → PARTIALLY_INVOICED → INVOICED → CLOSED`; `CANCELLED` only for unshipped quantity, which releases allocations |
| GL | None. Deposits taken against an SO post to `CUSTOMER_DEPOSITS` (§4.1.6) |

#### 4.1.3 Pick / pack / ship (delivery note)

1. **Pick list** generated per wave (by carrier cut-off, zone or priority). Bin and lot are chosen
   by strategy (FEFO/FIFO, §2.4.1). Scanning confirms bin, item, lot and serial.
2. **Short pick:** the picker reports the quantity actually found; the allocation is reduced and the
   shortfall goes back to backorder. A cycle-count task is raised for the bin.
3. **Pack:** cartons (SSCC-18 labels), weights and dimensions are recorded for carrier rating.
4. **Ship (post delivery note)**, all in one transaction:
   * `inventory_ledger` −qty at cost (FIFO/MAC/specific); allocations are consumed
   * GL: Dr COGS / Cr INV
   * If revenue is recognised **on shipment** (FOB shipping point, IFRS 15 control transferred):
     an auto-invoice is generated, or Dr *Unbilled receivables* / Cr Revenue for billing
     arrangements that invoice later
   * The serial status changes to `SHIPPED` and warranty starts
   * Outbox event `ShipmentPosted` goes to the 3PL/carrier integration (§8.2)

#### 4.1.4 Invoicing, including progress billing

| Billing type | Logic | GL |
|---|---|---|
| Standard (ship-then-bill) | Invoice lines = shipped, not yet invoiced qty (`shipped_qty − invoiced_qty`) | Dr AR / Cr Revenue, Cr TAX_OUTPUT |
| Bill-before-ship (advance invoice) | Allowed on prepaid terms only | Dr AR / Cr Contract liability; on shipment Dr Contract liability / Cr Revenue |
| Milestone / progress billing | `billing_schedule(so_id, milestone, pct or amount, trigger: DATE / EVENT / MANUAL)`; Σ pct = 100 % enforced | Dr AR / Cr Contract liability until performance obligation is satisfied; revenue recognised by output or input method (`% complete = cost incurred / total estimated cost`) via a monthly revenue-recognition run |
| Retention | `retention_pct` held back per progress invoice | Dr Retention receivable (separate AR account) |

Invoice validation: invoice date ≥ shipment date (unless advance), tax recomputed and compared
with the SO tax (a difference blocks posting unless the user re-determines), currency and rate
fixed at invoice date, payment terms produce `due_date` and early-payment discount terms
(e.g. `2/10 NET 30`).

#### 4.1.5 Payment receipt & bank deposit

| Step | Logic | GL |
|---|---|---|
| Receipt | Captured manually, via payment gateway webhook, or from a bank-feed match (§1.5) | Dr UNDEPOSITED_FUNDS (cash/cheque) **or** Dr Bank directly (bank transfer) / Cr AR |
| Application | Apply to specific invoices: explicit, oldest-first, or by remittance match. Unapplied remainder → `ON_ACCOUNT` (Cr Customer unapplied cash, a liability-side AR sub-account) | |
| Early-payment discount | If receipt date ≤ discount date: Dr Sales discounts (contra-revenue), with tax adjusted where the jurisdiction requires it | |
| Short payment | Below tolerance: write off to `Small balance write-off`; above tolerance: invoice stays partially open | |
| FX | Realised gain/loss per §1.3.4 on each application | Dr/Cr FX realised |
| Bank deposit | Groups receipts sitting in undeposited funds into one deposit slip that matches **one** bank-statement line (T4 subset-sum is unnecessary when the slip exists) | Dr Bank / Cr UNDEPOSITED_FUNDS |
| Bounced cheque | Reverse the receipt (new entry), reopen the invoices, add a bank charge, optionally charge the customer a fee | Dr AR / Cr Bank |

#### 4.1.6 Dealership mapping (current module → target postings)

| Dealership event (today) | Target treatment |
|---|---|
| Deposit received before delivery | Dr Bank / Cr **CUSTOMER_DEPOSITS** (liability) — today it posts to income; fix in Phase A |
| Delivery | Dr AR (customer) / Cr Vehicle sales revenue, Cr TAX_OUTPUT; Dr COGS / Cr INV (vehicle specific-ID cost); Dr CUSTOMER_DEPOSITS / Cr AR (apply deposits) |
| Lender disbursement | Dr Bank / Cr AR (financed portion is just another receipt from a third party) |
| Trade-in | Dr INV (trade-in vehicle at allowance) / Cr AR — non-cash consideration; payoff: Dr AR (or deal clearing) / Cr Bank |
| Cancel with refund | Dr CUSTOMER_DEPOSITS / Cr Bank (a refund document, not deletion of receipts) |

### 4.2 P2P state machine

```
REQUISITION ─approve─▶ PURCHASE ORDER ─send─▶ GRN ─▶ SUPPLIER INVOICE ─3-way match─▶ APPROVED BILL ─▶ PAYMENT RUN ─▶ BANK SETTLEMENT
```

#### 4.2.1 Purchase requisition

`DRAFT → SUBMITTED → APPROVED / REJECTED → SOURCED (converted to PO lines) → CLOSED`. The
budget check runs on submission: `available_budget = budget(period, combination) − actuals −
open commitments (approved PRs + open PO amounts)`. On a breach the policy can **block**,
**warn**, or **escalate**. Approved PR amounts are recorded as *pre-encumbrances*. These are
memo entries in a separate encumbrance ledger, not the GL.

#### 4.2.2 Approval matrix

```sql
CREATE TABLE approval_rules (
  id UUID PRIMARY KEY, tenant_id UUID, document_type TEXT,      -- PR, PO, BILL, JOURNAL, CREDIT_NOTE
  priority INT,                                                 -- lower wins
  conditions JSONB,       -- {"amount_base":{"gte":500000}, "department":["OPS"], "category":["CAPEX"]}
  steps JSONB             -- [{"type":"ROLE","role":"DEPT_HEAD","mode":"ANY"},
                          --  {"type":"ROLE","role":"CFO","mode":"ANY","if":{"amount_base":{"gte":2000000}}}]
);
```

* Rules are evaluated in priority order and the first match wins. Steps run in sequence. A step's
  `mode` is `ANY` (one approver from the group) or `ALL`.
* **Segregation of duties:** the requester can never approve their own document, and the
  approver of a PO cannot post the GRN for it. Violations are hard errors.
* Delegation applies for absences (`delegations(from_user, to_user, from_date, to_date)`).
  Escalation happens after an SLA (e.g. 48 business hours) to the approver's manager.
* Any amendment that raises the amount by more than `re-approval_threshold` (default 10 %) or
  changes supplier, item or account restarts approval.

#### 4.2.3 Purchase order & GRN

| Step | Validation | GL |
|---|---|---|
| PO create | Supplier active, not blocked; supplier-item record gives price, lead time, MOQ, order multiple; currency fixed; tolerances copied from the supplier or category (`qty_over_pct`, `price_over_pct`) | Commitment: encumbrance ledger converts the PR pre-encumbrance to an encumbrance |
| PO states | `DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED → PARTIALLY_BILLED → BILLED → CLOSED`; `CANCELLED` for unreceived qty | |
| GRN | Qty received per line ≤ `ordered × (1 + qty_over_pct)` (else reject or route to approval); lot/serial captured; quality inspection items go to `QUALITY_HOLD` | Dr INV (PO price × PO rate + estimated landed cost) / Cr GRNI |
| Inspection result | Accept → `AVAILABLE`; reject → return-to-vendor (§2.3 #15) | Zero-value status change |

#### 4.2.4 Three-way matching engine

Match unit: **invoice line ↔ PO line ↔ GRN line(s)**. The engine compares per invoice line:

| Check | Formula | Tolerance (default) | Outcome on breach |
|---|---|---|---|
| Quantity | `inv_qty ≤ received_qty − previously_invoiced_qty` | 0 % for serialised, 2 % for bulk | Hold `QTY_VARIANCE` |
| Price | `|inv_unit_price − po_unit_price| / po_unit_price` | 1 % **and** ≤ absolute cap (e.g. PKR 5,000/line) | Hold `PRICE_VARIANCE` |
| Amount | Line total within combined tolerance | — | Hold |
| Tax | Supplier tax vs engine-computed tax | 0.5 % or 1.00 | Hold `TAX_VARIANCE` |
| Currency, supplier, PO status | Exact | — | Reject |
| Duplicate | Same supplier + supplier invoice number (normalised) in the last 2 years, or same supplier + amount + date ± 3 days | — | Hold `POSSIBLE_DUPLICATE` |

**Two-way** matching (PO ↔ invoice) is allowed only for service lines flagged `receipt_required =
false`. **Four-way** matching adds inspection acceptance.

**Posting a matched invoice:**

```
Dr GRNI                   received_qty_matched × po_price × grn_rate   (clears exactly what the GRN credited)
Dr INV / COGS / PPV       price variance (§2.1.3 split: still on hand → INV under MAC; issued → COGS; standard → PPV)
Dr FX (if invoice rate ≠ GRN rate for the same TC amount)
Dr TAX_INPUT              recoverable tax
   Cr AP                  invoice total
```

A GRNI line stays open when the GRN is not yet invoiced; the **GRNI aging report** must
reconcile to the GRNI GL balance at every close.

**Discrepancy resolution workflow:** a held invoice goes to the buyer, who can (a) accept the
variance with a reason code, which posts it; (b) request a credit/debit note from the supplier;
(c) amend the PO, which needs re-approval if over threshold; or (d) reject the invoice. Every
decision is audited.

#### 4.2.5 Bill payment & outbound bank settlement

1. **Payment proposal** (payment run): selects approved, unheld bills where
   `due_date ≤ run_date + horizon` or the discount date falls inside the window and taking the
   discount is profitable (`discount_rate_annualised > cost_of_capital`). It nets supplier debit
   notes and excludes suppliers on payment hold.
2. **Approval** of the run, using matrix document type `PAYMENT_RUN`.
3. **Withholding tax** is computed per supplier/category (e.g. Pakistan §153 rates):
   Dr AP (gross) / Cr Bank (net) / Cr WHT payable. A certificate number is recorded.
4. **File generation:** ISO 20022 `pain.001.001.09` (or bank CSV / host-to-host). Each payment
   gets an `EndToEndId` = payment UUID so the bank statement auto-matches at T1 (§1.5.2).
5. **Posting at release:** Dr AP / Cr *Payments in transit* (bank clearing). On the bank statement
   match: Dr Payments in transit / Cr Bank. This separates "sent" from "cleared".
6. Bank rejection (`pain.002` status `RJCT`) reverses step 5 and reopens the bill.

### 4.3 Exception, reversal & return workflows

#### 4.3.1 Partial shipments, split billing, over-shipments

| Scenario | Rule |
|---|---|
| Partial shipment | The SO line keeps `ordered`, `allocated`, `shipped`, `invoiced` and `cancelled` quantities, with invariant `shipped ≤ ordered + over_ship_allowance` and `invoiced ≤ shipped` (unless advance billing). Remaining qty stays allocated or backordered. A `ship_complete` flag on the customer or order forbids partial shipments |
| Split billing | One shipment invoiced to several bill-to parties (e.g. dealership: customer pays the deposit, the bank pays the financed part). Invoice lines carry `billing_split_pct`; Σ per shipment line = 100 %; each bill-to gets its own AR item |
| Over-shipment | Allowed up to `item.over_ship_pct` (default 0). The excess is invoiced only if the customer accepts; otherwise it is auto-converted to an RMA for return |
| Under-delivery from supplier | The PO line stays open until closed manually or until `auto_close_tolerance` (e.g. 98 % received) is met; closing releases the remaining encumbrance |

#### 4.3.2 RMA and credit notes (with restock)

```
RMA REQUESTED → APPROVED → RECEIVED → INSPECTED → (RESTOCKED | SCRAPPED | REPAIRED | RETURNED_TO_CUSTOMER) → CREDITED → CLOSED
```

* The RMA references original invoice lines. Returnable qty = `invoiced − already returned`.
  The return window is `item.return_days` from the delivery date.
* **Receive:** goods go to `QUARANTINE` at **original cost** (from the shipment's
  `cost_consumptions` for FIFO, or the issue's recorded unit cost for MAC). The ledger row
  references the original issue so costing re-creates a layer at that cost (FIFO) or adds
  `qty × original_cost` to `V` (MAC).
* **Inspect:** restock → `AVAILABLE` (§2.3 #13); scrap → expense (#14); restocking fee is applied
  as a separate credit-note line.
* **Credit note:** Dr Revenue (and Sales returns contra-account if used), Dr TAX_OUTPUT, Cr AR.
  Tax uses the **original invoice's tax rates and FX rate**, never today's. If the original
  invoice is paid, the credit sits as unapplied credit or is refunded (Dr AR / Cr Bank).
* Credit notes without returns (price adjustment, goodwill) need approval; there is no
  inventory impact.

#### 4.3.3 Debit notes (supplier disputes)

* **Return to supplier:** debit note lines reference GRN lines. Inventory −qty at original layer
  cost (§2.3 #15). GL: Dr AP / Cr INV (cost) / Cr TAX_INPUT (reverse recovered tax) / ± PPV for
  price difference.
* **Price dispute without return:** Dr AP / Cr PPV (or INV/COGS by the §2.1.3 split) / Cr
  TAX_INPUT.
* **Dispute state:** `OPEN → SUPPLIER_ACKNOWLEDGED → CREDIT_RECEIVED (matched to supplier credit
  note) → CLOSED`. Disputed amounts are excluded from payment runs, while the undisputed
  remainder of the bill stays payable.

---

## 5. Regulatory compliance, tax engine & auditing

### 5.1 Multi-jurisdictional tax architecture

#### 5.1.1 Service layout

```
             ┌──────────────────────── Tax Service (stateless, horizontally scaled) ──────────────────────┐
 document ─▶ │ 1 Address resolver ─▶ 2 Jurisdiction finder ─▶ 3 Nexus/registration check ─▶ 4 Taxability   │
 lines       │   (geocode, rooftop)     (zip+4 / lat-long →     (where are we registered;    (product tax   │
             │                           state/county/city/       economic nexus thresholds)  code × juris- │
             │                           special districts)                                   diction)     │
             │ ─▶ 5 Exemption engine ─▶ 6 Rate & rule calc ─▶ 7 Rounding ─▶ 8 Result + explanation trail   │
             └───────────┬────────────────────────────────────────────────────────────────────────────────┘
                         │ reads versioned content: tax_jurisdictions, tax_rates, tax_rules, product_tax_codes,
                         │ exemption_certificates (effective-dated, never updated in place)
                         ▼
             External adapters (optional): Avalara / Vertex / TaxJar for US rooftop rates; VIES for EU VAT IDs
```

* **Interface:** `POST /tax/calculate` with `{ document_type, document_date, tax_point_date,
  seller{entity, ship_from}, buyer{customer_id, ship_to, bill_to, tax_ids[], exemption_ids[]},
  lines[{ line_id, product_tax_code, amount, qty, discount, is_tax_inclusive }] }`. The response
  holds per-line `taxes[]` with `{ jurisdiction, tax_type, rate, taxable_base, tax_amount,
  recoverable_pct, rule_ids[], certificate_id? }`.
* **Determinism:** a calculation is reproducible from `(content_version, request)`. The
  response's `content_version` is stored on the document so a credit note years later recomputes
  with the same rules.
* **Commit vs quote:** `calculate` is side-effect free. On document posting, `commit` records
  the tax transaction in `tax_transactions` (the source for returns). Voiding a document calls
  `uncommit`, which writes a negative transaction, never a delete.

#### 5.1.2 Content schema

```sql
CREATE TABLE tax_jurisdictions (id UUID PRIMARY KEY, country CHAR(2), level TEXT,  -- COUNTRY, STATE, COUNTY, CITY, DISTRICT, PROVINCE
  code TEXT, name TEXT, parent_id UUID, geometry GEOMETRY(MultiPolygon, 4326) NULL);
CREATE TABLE tax_rates (id UUID PRIMARY KEY, jurisdiction_id UUID, tax_type TEXT,   -- SALES, USE, VAT, GST, PST, HST, QST, EXCISE
  product_tax_code TEXT NULL,       -- NULL = general rate
  rate NUMERIC(9,6), effective_from DATE, effective_to DATE,
  is_compound BOOLEAN DEFAULT false, compound_order INT DEFAULT 0,
  max_taxable_amount NUMERIC(20,4) NULL,          -- caps e.g. per-item limits
  EXCLUDE USING gist (jurisdiction_id WITH =, tax_type WITH =, coalesce(product_tax_code,'') WITH =,
                      daterange(effective_from, effective_to, '[)') WITH &&));
CREATE TABLE tax_registrations (entity_id UUID, jurisdiction_id UUID, registration_no TEXT,
  sourcing TEXT CHECK (sourcing IN ('ORIGIN','DESTINATION')), effective_from DATE, effective_to DATE);
```

#### 5.1.3 Regional rule sets

**US sales and use tax**

1. Resolve the ship-to to jurisdictions by **rooftop geocode** (ZIP alone is ambiguous; one ZIP
   spans several cities). ZIP+4 is the fallback, and the 5-digit ZIP centroid is the last resort
   (flagged `LOW_CONFIDENCE`).
2. **Nexus:** tax only where the seller has physical or economic nexus. The nexus engine tracks
   rolling 12-month sales and transaction counts per state against thresholds (e.g. USD 100,000
   or 200 transactions) and raises `NEXUS_THRESHOLD_APPROACHING` at 80 %.
3. **Sourcing:** destination-based in most states. For intrastate sales in origin-based states
   (e.g. Texas, Arizona for some cases) the seller's location rates apply. This is per
   `tax_registrations.sourcing`.
4. Total rate = state + county + city + special districts. Each is stored as a separate tax line
   for filing.
5. **Product taxability:** `product_tax_code` (clothing, groceries, SaaS…) × state rules (exempt,
   reduced, thresholds such as "clothing under USD 110 exempt").
6. Use tax: purchases from unregistered sellers are self-assessed (Dr Use tax expense or asset /
   Cr Use tax payable).

**EU VAT (destination principle)**

| Case | Treatment |
|---|---|
| B2B intra-EU goods, valid buyer VAT ID (VIES check stored with consultation number) | Zero-rated supply; invoice text "Intra-Community supply, Art. 138 VAT Directive"; buyer self-accounts (reverse charge) |
| B2C intra-EU goods (distance sales) | Destination country rate once the EU-wide EUR 10,000 threshold is exceeded; reported via **OSS** |
| B2B services | Place of supply = customer's country, reverse charge |
| Domestic | Local rates: standard, reduced, super-reduced, zero |
| Imports | Import VAT at customs; recoverable as input VAT (not capitalised, §2.2.1) |
| Reverse-charge purchase | Two lines on the purchase: Dr TAX_INPUT / Cr TAX_OUTPUT (self-assessed), net zero when fully deductible |

**Canada GST/HST/PST/QST (compound rules)**

| Province type | Calculation |
|---|---|
| HST provinces (ON 13 %, NS 15 %…) | One harmonised tax: `tax = base × HST` |
| GST + PST (BC 5 % + 7 %, SK, MB) | Both on the base, not compounded: `GST = base × 5 %`, `PST = base × PST rate` |
| GST + QST (Québec) | QST on the base (not compounded since 2013): `GST = base × 5 %`, `QST = base × 9.975 %` |
| Historic compound (PEI pre-2013, Québec pre-2013) | `compound_order`: `PST = (base + GST) × PST rate`; the engine applies taxes in `compound_order`, adding prior compound taxes to the base when `is_compound = true` |

PST is generally **not recoverable** as an input tax credit, so it is capitalised or expensed.
GST/HST is recoverable. This is the `recoverable_pct` field.

**Pakistan (current deployment)**

Federal sales tax on goods (standard 18 %, schedules for reduced/exempt items) and provincial
sales tax on services (PRA, SRB, KPRA, BRA, each with its own rate). Withholding at source on
payments (income tax §153, sales-tax withholding per the Withholding Rules). Further tax applies
on supplies to unregistered persons. FBR invoice integration (POS / e-invoicing) is an outbound
adapter.

#### 5.1.4 Exemption certificates

```sql
CREATE TABLE exemption_certificates (
  id UUID PRIMARY KEY, tenant_id UUID, customer_id UUID NOT NULL,
  certificate_no TEXT NOT NULL, exemption_reason TEXT NOT NULL,   -- RESALE, GOVERNMENT, NON_PROFIT, MANUFACTURING, DIPLOMATIC
  jurisdictions UUID[] NOT NULL,      -- where it is valid (e.g. multistate SST certificate)
  product_tax_codes TEXT[] NULL,      -- NULL = all products
  valid_from DATE NOT NULL, valid_to DATE,
  status TEXT CHECK (status IN ('PENDING_REVIEW','VALID','EXPIRED','REVOKED')),
  document_uri TEXT NOT NULL, document_sha256 CHAR(64) NOT NULL,
  reviewed_by UUID, reviewed_at TIMESTAMPTZ
);
```

* Applied only if `status = VALID`, the document date is inside validity, and the ship-to
  jurisdiction ∈ `jurisdictions`. The applied certificate ID is stored on each exempt tax line,
  which is the evidence for audit.
* Expiry: alerts go out 30 days ahead; an expired certificate stops exemption on **new**
  documents only.
* A missing certificate for a customer flagged exempt makes the engine tax the sale and raise
  `EXEMPTION_CERTIFICATE_MISSING`, rather than silently exempting it.

#### 5.1.5 Partial deductibility

`recoverable_pct` per (tax code, expense category, entity) — e.g. 50 % VAT recovery on
entertainment, or the pro-rata recovery fraction for partially exempt businesses. Purchase
posting splits as `Dr TAX_INPUT = tax × recoverable_pct`, and `Dr expense / asset = tax × (1 −
recoverable_pct)`. Annual pro-rata true-up journal: `adjustment = Σ input tax × (final_ratio −
provisional_ratio)`.

#### 5.1.6 Rounding & returns

Rounding mode per jurisdiction: per line or per invoice-total-per-rate, half-up or half-even,
taken from the content table. Tax returns are generated from `tax_transactions` grouped by
(jurisdiction, tax_type, rate, box mapping). The return is reconciled to the TAX_OUTPUT /
TAX_INPUT GL balances before filing. A filed return locks its tax period: later documents dated
in that period go to the next return as adjustments.

### 5.2 Immutable audit trail

#### 5.2.1 Zero-deletion paradigm

1. No business table grants `DELETE` to application roles. "Delete" means a status change
   (`is_active = false`, `voided_at`, `status = CANCELLED`).
2. Financial documents (journals, invoices, GRNs, payments) are immutable once posted and are
   corrected only by reversing documents (§1.2.3).
3. Master data keeps **temporal versions** (`valid_from`, `valid_to`, `version`). Reports can be
   run "as of" any timestamp.
4. Personal data erasure (GDPR Art. 17) uses **crypto-shredding**: PII columns are encrypted with
   a per-subject data key; erasure destroys the key, so financial rows stay intact while PII
   becomes unreadable. Statutory retention (typically 7–10 years) overrides erasure for invoices.

#### 5.2.2 Audit log record

```sql
CREATE TABLE audit_log (
  seq            BIGINT GENERATED ALWAYS AS IDENTITY,   -- gap detection
  id             UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  txn_id         BIGINT NOT NULL DEFAULT txid_current(),  -- DB transaction
  business_txn_id UUID,                                   -- e.g. journal entry / document id
  actor_user_id  UUID,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('USER','SERVICE','SYSTEM_JOB','INTEGRATION')),
  session_id     UUID,
  ip_address     INET,
  user_agent     TEXT,
  app_version    TEXT NOT NULL,                           -- git SHA of the deployed build
  request_id     UUID,                                    -- correlation id across services
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  action         TEXT NOT NULL,                           -- CREATE, UPDATE, POST, REVERSE, VOID, APPROVE, LOGIN, EXPORT…
  before_state   JSONB,
  after_state    JSONB,
  delta          JSONB,                                   -- RFC 6902 JSON Patch before→after
  reason         TEXT,                                    -- mandatory for VOID/REVERSE/override actions
  prev_hash      BYTEA NOT NULL,
  row_hash       BYTEA NOT NULL,
  PRIMARY KEY (tenant_id, seq)
) PARTITION BY RANGE (occurred_at);
```

**Hash chain** (tamper evidence, per tenant):

```
row_hash = SHA-256( prev_hash ‖ tenant_id ‖ seq ‖ occurred_at ‖ actor_user_id ‖ entity_type ‖
                    entity_id ‖ action ‖ canonical_json(before_state) ‖ canonical_json(after_state) )
```

* `canonical_json` is RFC 8785 JCS, so the hash is independent of key order.
* Insertion runs through a `SECURITY DEFINER` function that takes `pg_advisory_xact_lock(
  hash(tenant_id))`, reads the tenant's last `row_hash`, computes the new one and inserts it. This
  serialises writers per tenant, which is acceptable because audit volume is far below ledger
  volume. The ledger tables themselves are not serialised this way.
* **Capture:** generic `AFTER INSERT OR UPDATE` triggers on audited tables write before/after
  from `OLD`/`NEW`. Request context (user, session, IP, app version, request ID) is passed with
  `SET LOCAL app.user_id = …` at the start of each transaction and read with
  `current_setting('app.user_id', true)`. Because it is in the same transaction, an action cannot
  commit without its audit row. This fixes today's best-effort `recordAudit`.
* **Anchoring:** every hour a job publishes the latest `row_hash` per tenant to an external
  write-once store (S3 Object Lock in compliance mode, or an RFC 3161 timestamping authority).
  Verification recomputes the chain and compares it with the anchors. A break pinpoints the first
  altered `seq`.
* **Storage:** monthly partitions. Partitions older than 13 months move to cheaper tablespace and
  are exported to Parquet in object storage with Object Lock for the retention period. The DB
  role owning `audit_log` is separate from the application role, and the application role has
  `INSERT` (via the function) and `SELECT` only.
* **Read access is audited too:** exports, report downloads, and viewing of sensitive records
  (payroll, bank details) write `action = 'READ'/'EXPORT'` rows.

### 5.3 Period closings & anti-tampering hard locks

#### 5.3.1 Period model

```sql
CREATE TABLE fiscal_years (id UUID PRIMARY KEY, company_id UUID, name TEXT, start_date DATE, end_date DATE,
  status TEXT CHECK (status IN ('OPEN','CLOSING','CLOSED')));
CREATE TABLE accounting_periods (
  id UUID PRIMARY KEY, company_id UUID NOT NULL, fiscal_year_id UUID NOT NULL,
  period_no SMALLINT NOT NULL,         -- 1..12, 13 = adjustment period (dated last day of year)
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('FUTURE','OPEN','SOFT_CLOSED','HARD_CLOSED','PERMANENTLY_LOCKED')),
  module_locks JSONB NOT NULL DEFAULT '{}',   -- {"AR":"CLOSED","AP":"OPEN","INV":"CLOSED"} sub-ledger cut-off
  closed_by UUID, closed_at TIMESTAMPTZ,
  EXCLUDE USING gist (company_id WITH =, daterange(start_date, end_date, '[]') WITH &&)  -- no overlaps
);
```

| Status | Who can post |
|---|---|
| FUTURE | Nobody (except recurring/reversal schedules, which wait) |
| OPEN | Everyone with posting rights |
| SOFT_CLOSED | Only users with `post_soft_closed` (finance team doing adjustments); sub-ledgers blocked |
| HARD_CLOSED | Nobody. Reopening requires `reopen_period`, a reason, and dual approval (CFO + controller); allowed only if the next period is not HARD_CLOSED and no tax return for it is filed |
| PERMANENTLY_LOCKED | Nobody, ever. Applied after the statutory audit sign-off; there is no transition out |

#### 5.3.2 Hard-lock enforcement (database level)

```sql
CREATE OR REPLACE FUNCTION assert_period_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st TEXT; ml TEXT;
BEGIN
  SELECT status, module_locks ->> NEW.source_module INTO st, ml
    FROM accounting_periods
   WHERE company_id = NEW.company_id AND NEW.posting_date BETWEEN start_date AND end_date
   FOR SHARE;                                           -- conflicts with close's FOR UPDATE
  IF st IS NULL THEN RAISE EXCEPTION 'ERR_NO_PERIOD date=%', NEW.posting_date USING ERRCODE='23514'; END IF;
  IF st IN ('FUTURE','HARD_CLOSED','PERMANENTLY_LOCKED') THEN
    RAISE EXCEPTION 'ERR_PERIOD_CLOSED status=% date=%', st, NEW.posting_date USING ERRCODE='23514';
  END IF;
  IF st = 'SOFT_CLOSED' AND current_setting('app.can_post_soft_closed', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'ERR_PERIOD_SOFT_CLOSED' USING ERRCODE='23514';
  END IF;
  IF ml = 'CLOSED' THEN
    RAISE EXCEPTION 'ERR_MODULE_CLOSED module=%', NEW.source_module USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entries_period_gate BEFORE INSERT OR UPDATE OF posting_date, status
  ON journal_entries FOR EACH ROW WHEN (NEW.status = 'POSTED') EXECUTE FUNCTION assert_period_open();
-- identical triggers on inventory_ledger (movement_date) and tax_transactions (tax_point_date)
```

The trigger runs **inside the database**, so no API path, script or future service can bypass it.
The application performs the same check earlier for friendly error messages, and the DB trigger
is the guarantee. `posting_date` is distinct from `document_date`: a supplier invoice dated in a
closed period is posted with `posting_date` = first day of the first open period, keeping
`document_date` for aging and tax.

#### 5.3.3 Close checklists

**Monthly (soft close → hard close):**

| # | Check | Blocking |
|---|---|---|
| 1 | All sub-ledger documents for the period posted (no DRAFT/APPROVED unposted GRNs, invoices, payments dated in period) | Yes |
| 2 | AR sub-ledger total = AR_CONTROL; AP sub-ledger = AP_CONTROL; inventory valuation (Σ `inventory_ledger.value_base`) = INV accounts; GRNI aging = GRNI | Yes |
| 3 | Bank reconciliations finalised for every bank account to period end; SUSPENSE = 0 | Yes |
| 4 | FX revaluation run (§1.3.4) and auto-reversal scheduled | Yes |
| 5 | Depreciation run; accruals and prepayment amortisation posted | Yes |
| 6 | Inventory re-costing queue empty for the period; NRV review done | Yes |
| 7 | LANDED_COST_CLEARING aged items < 60 days | Warning |
| 8 | Inter-company balances net to zero | Yes (for consolidating groups) |
| 9 | Trial balance balanced; `account_balances` cache = full re-aggregation | Yes |
| 10 | Tax reports generated and reconciled to GL | Yes (if a filing period ends) |

The close itself is a transaction: `SELECT … FROM accounting_periods WHERE id = $p FOR UPDATE`
(waits for in-flight postings holding `FOR SHARE`), re-runs the blocking checks, sets the status,
and writes the audit row.

**Quarterly:** monthly checks plus tax return filing lock, management accounts pack, and
covenant calculations.

**Fiscal year-end:**

1. Close periods 1–12. Period 13 (adjustment period) stays SOFT_CLOSED for auditor adjustments.
2. **Closing entry** (system-generated, `source_type = YEAR_END_CLOSE`): for each P&L account
   balance `b` (by combination), post the opposite amount; the net goes to RETAINED_EARNINGS:
   `Dr Revenue (Σ credit balances) / Cr Expenses (Σ debit balances) / Cr or Dr RETAINED_EARNINGS
   (net income)`. Dimensions are preserved (company, department) if retained earnings is tracked
   by segment; otherwise collapsed.
3. **Opening balances** for the new year are not posted: balance-sheet balances roll forward by
   definition (`balance = Σ all lines to date`). The P&L starts at zero because of the closing
   entry. This avoids "opening balance" journals that can drift.
4. After audit sign-off, the year moves to `PERMANENTLY_LOCKED`.

#### 5.3.4 Prior-period corrections

The hard lock means a closed period's numbers never change. Corrections follow IAS 8:

| Type | Mechanism |
|---|---|
| Immaterial error | Correction entry in the **current open period**, `correction_of_period_id` set, reason mandatory; reported in the current period's P&L |
| Material prior-period error | **Prior-period adjustment** document: posted in the current period with Dr/Cr *Opening retained earnings adjustment* instead of P&L accounts; the comparative-period restatement is produced by the reporting layer (a restatement overlay keyed by `correction_of_period_id`), not by posting into the locked period |
| Change in accounting estimate | Prospective, current and future periods only |
| Sub-ledger corrections (e.g. FIFO re-cost reaching into a closed period, §2.1.2) | Same rule: the revaluation row and its GL entry are dated in the first open period and reference the original movement |

Every correction entry carries `reason`, `correction_of_entry_id` and/or
`correction_of_period_id`, and requires approval from a role different from the preparer.

---

## 6. Mathematical engine for financial reporting

### 6.1 Foundations

* **Signed balance convention:** `signed = debit_base − credit_base`. Debit-normal accounts
  display `signed`, credit-normal accounts display `−signed`. Store one convention, flip only at
  presentation.
* **Report line mapping** is data, not code:

```sql
CREATE TABLE report_layouts (id UUID PRIMARY KEY, tenant_id UUID, report TEXT,   -- BS, PL, CF_INDIRECT, CF_DIRECT
  version INT, is_active BOOLEAN);
CREATE TABLE report_lines (id UUID PRIMARY KEY, layout_id UUID, code TEXT, label TEXT,
  parent_code TEXT, sort_order INT,
  line_type TEXT CHECK (line_type IN ('HEADER','ACCOUNTS','FORMULA','TOTAL')),
  sign_flip BOOLEAN DEFAULT false,
  account_path_filter LTREE[] NULL,        -- e.g. {'1.11','1.12'} includes subtrees
  formula TEXT NULL);                      -- e.g. 'GROSS_PROFIT - OPEX'
```

  An **unmapped-account check** runs on every report: any account with a non-zero balance that
  matches no `ACCOUNTS` line raises `WARN_UNMAPPED_ACCOUNT`, so nothing silently falls out of a
  statement.
* **Real time:** reports read `account_balances` (period granularity, §1.2.4) for complete
  periods, plus `journal_lines` for the partial current period up to `as_of`. A materialised
  daily snapshot (`account_balances_daily`) speeds up arbitrary date ranges; it is refreshed
  incrementally from the outbox stream.
* Every report response includes `as_of`, `generated_at`, `ledger_high_water_mark` (max posted
  entry seq included) and a checksum, so two runs can be proven identical.

### 6.2 Balance sheet

Equation enforced at render time: **Assets = Liabilities + Equity**, where Equity includes
current-year earnings computed on the fly (no closing entry is needed mid-year).

```sql
-- $1 tenant, $2 company, $3 as_of date, $4 fiscal_year_start
WITH bal AS (
  SELECT a.id, a.path, a.account_class, sum(l.debit_base - l.credit_base) AS signed
  FROM journal_lines l
  JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
  JOIN accounts a        ON a.id = l.account_id
  WHERE e.tenant_id = $1 AND e.company_id = $2 AND e.posting_date <= $3
  GROUP BY a.id, a.path, a.account_class
),
cye AS (   -- current-year earnings: P&L accounts since fiscal year start
  SELECT -sum(l.debit_base - l.credit_base) AS amount
  FROM journal_lines l
  JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
  JOIN accounts a        ON a.id = l.account_id
  WHERE e.tenant_id = $1 AND e.company_id = $2
    AND e.posting_date BETWEEN $4 AND $3
    AND a.account_class IN ('REVENUE','COGS','EXPENSE','OTHER','TAX')
    AND e.source_type <> 'YEAR_END_CLOSE'
)
SELECT
  sum(signed)  FILTER (WHERE account_class = 'ASSET')                         AS total_assets,
  -sum(signed) FILTER (WHERE account_class = 'LIABILITY')                     AS total_liabilities,
  -sum(signed) FILTER (WHERE account_class = 'EQUITY')                        AS equity_posted,
  (SELECT amount FROM cye)                                                    AS current_year_earnings,
  sum(signed)  FILTER (WHERE account_class = 'ASSET')
   - ( -sum(signed) FILTER (WHERE account_class = 'LIABILITY')
       -sum(signed) FILTER (WHERE account_class = 'EQUITY')
       + (SELECT amount FROM cye) )                                           AS imbalance  -- MUST be 0
FROM bal;
```

Why the identity holds: every entry is balanced, so Σ signed over *all* accounts = 0. Splitting
into classes, `A − L − E_posted − (P&L since inception) = 0`. Prior years' P&L has been closed
into retained earnings (part of `E_posted`), and only the current year's P&L remains open, which
is `cye`. A non-zero `imbalance` therefore signals a missing year-end close or an unmapped class,
and the report shows it as a red reconciling line instead of hiding it.

**Column layout:** `Line | Current (as_of) | Comparative (as_of − 1 year) | Change | Change %`,
with drill-down `line → accounts → GL combinations → journal lines → source document`.
**Retained earnings displayed** = `RE posted balance + current_year_earnings`.

### 6.3 Profit & loss (multi-step)

```
Revenue (4xxx, net of contra: returns, discounts)                        R
− Cost of goods sold (5xxx)                                              C
= Gross profit                                         GP = R − C        GM% = GP / R
− Operating expenses (6xxx) by function or nature                        OPEX
= Operating profit (EBIT before other items)           OP = GP − OPEX
+ Other income − other expense (7xxx), incl. FX gains/losses             O
= Profit before tax                                    PBT = OP + O
− Tax expense (8xxx)                                                     T
= Net profit                                           NP = PBT − T
EBITDA = OP + depreciation + amortisation (accounts tagged with report_tag 'D&A')
```

```sql
SELECT rl.code, rl.label,
       sum(CASE WHEN e.posting_date BETWEEN $3 AND $4 THEN -(l.debit_base - l.credit_base) END) AS current_period,
       sum(CASE WHEN e.posting_date BETWEEN $5 AND $6 THEN -(l.debit_base - l.credit_base) END) AS comparative,
       sum(CASE WHEN e.posting_date BETWEEN $7 AND $4 THEN -(l.debit_base - l.credit_base) END) AS year_to_date
FROM journal_lines l
JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
                      AND e.source_type <> 'YEAR_END_CLOSE'          -- never let the close zero the P&L
JOIN accounts a        ON a.id = l.account_id
JOIN report_lines rl   ON rl.layout_id = $2 AND rl.line_type = 'ACCOUNTS'
                      AND a.path <@ ANY (rl.account_path_filter)
WHERE e.tenant_id = $1 AND e.posting_date BETWEEN least($3,$5,$7) AND $4
GROUP BY rl.code, rl.label, rl.sort_order
ORDER BY rl.sort_order;
-- FORMULA / TOTAL lines are evaluated in the application over this result set, in dependency order.
```

Values are credit-positive (revenue positive, expenses negative); `sign_flip` lets layouts show
expenses as positive numbers.

**Revenue recognition mapping.** Revenue appears in the P&L only through postings, so
recognition policy lives in the posting rules (§4.1.4): point-in-time revenue posts at shipment
or invoice; over-time revenue posts from the monthly recognition run (contract liability →
revenue). The P&L query never applies recognition logic itself, so P&L always equals the
ledger.

**COGS by costing layer.** COGS is the sum of COGS-account postings, which come from the
inventory ledger valued by the item's engine (FIFO consumptions, MAC issue values, specific ID).
For margin analysis by product, the report joins COGS lines to `inventory_ledger` via
`source_line_id` to show `revenue − cost` per invoice line, and optionally the
**FIFO-layer breakdown** (which receipt layers fed the sale, via `cost_consumptions`).

### 6.4 Cash flow statement

#### 6.4.1 Direct method

Classify every journal line that hits a **cash or cash-equivalent account** (`accounts.is_cash =
true`) by the *other side* of its entry:

```sql
WITH cash_lines AS (
  SELECT l.entry_id, sum(l.debit_base - l.credit_base) AS cash_delta
  FROM journal_lines l JOIN accounts a ON a.id = l.account_id AND a.is_cash
  JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
  WHERE e.company_id = $1 AND e.posting_date BETWEEN $2 AND $3
  GROUP BY l.entry_id
  HAVING sum(l.debit_base - l.credit_base) <> 0          -- transfers between cash accounts net out
),
counter AS (   -- non-cash lines of the same entries, weighted to allocate cash_delta
  SELECT l.entry_id, a.cash_flow_category, sum(l.debit_base - l.credit_base) AS amt
  FROM journal_lines l JOIN accounts a ON a.id = l.account_id AND NOT a.is_cash
  WHERE l.entry_id IN (SELECT entry_id FROM cash_lines)
  GROUP BY l.entry_id, a.cash_flow_category
),
weights AS (
  SELECT c.entry_id, c.cash_flow_category,
         c.amt / nullif(sum(c.amt) OVER (PARTITION BY c.entry_id), 0) AS w
  FROM counter c
)
SELECT w.cash_flow_category, round(sum(cl.cash_delta * w.w), 4) AS cash_flow
FROM cash_lines cl JOIN weights w USING (entry_id)
GROUP BY w.cash_flow_category;
```

`accounts.cash_flow_category` is set per account: `OP_RECEIPTS_CUSTOMERS` (AR, revenue),
`OP_PAYMENTS_SUPPLIERS` (AP, inventory), `OP_PAYMENTS_EMPLOYEES`, `OP_TAX_PAID`,
`OP_INTEREST_PAID` (policy choice: operating or financing), `INV_CAPEX` (fixed assets),
`INV_DISPOSALS`, `FIN_DEBT_PROCEEDS`, `FIN_DEBT_REPAYMENT`, `FIN_EQUITY`, `FIN_DIVIDENDS`. For a
mixed entry (one receipt clearing AR and paying a bank fee), the cash is allocated pro-rata by
the counter-lines, which is what the window-weight does. The last rounding cent is pushed to the
largest category so the total equals the exact cash change.

**Proof line:** `opening cash + Σ categories + FX effect on cash = closing cash`. FX effect =
revaluation postings on cash accounts (`source_type = FX_REVALUATION`), shown separately as IAS 7
requires.

#### 6.4.2 Indirect method

```
Net profit (from §6.3)                                                NP
+ Non-cash expenses:  depreciation, amortisation, impairment, NRV write-down,
                      unrealised FX loss, share-based payments   (accounts tagged NON_CASH)
− Non-cash income:    unrealised FX gain, gains on disposal (proceeds are investing)
± Working-capital changes (Δ = closing − opening balance, signed):
   − Δ Trade receivables           (increase in AR consumes cash)
   − Δ Inventory
   − Δ Prepayments / other current assets
   + Δ Trade payables
   + Δ Accruals, contract liabilities, CUSTOMER_DEPOSITS
   + Δ Tax payable (net of tax expense / tax paid split)
= Cash from operating activities                                      CFO
Investing: − capex + disposal proceeds (from direct classification of those cash lines)   CFI
Financing: + borrowings − repayments + equity − dividends                                CFF
Net change = CFO + CFI + CFF;  check: = Δ cash − FX effect on cash  (MUST be 0 difference)
```

Working-capital deltas use `account_balances` at the opening and closing dates with
`accounts.cash_flow_category` grouping. **Cross-check:** CFO (indirect) MUST equal CFO (direct).
The report shows both and the difference. A difference means a mis-tagged account, and the
report lists accounts whose balances moved but have no category.

### 6.5 Aging buckets engine

**Open items** come from the sub-ledger, not the GL: `ar_open_items(invoice_id, customer_id,
document_date, due_date, currency, original_txn, open_txn, open_base_at_carrying_rate)`. Open
amounts are maintained by applications (receipts, credit notes) and recomputed **as of** a date by
replaying applications dated ≤ as_of, so a historical aging can be reproduced.

```sql
-- $1 company, $2 as_of, $3 basis ('DUE' or 'INVOICE')
WITH open_as_of AS (
  SELECT i.id, i.customer_id, i.currency, i.document_date, i.due_date,
         i.total_txn - coalesce(sum(ap.applied_txn) FILTER (WHERE ap.applied_on <= $2), 0) AS open_txn
  FROM ar_invoices i
  LEFT JOIN ar_applications ap ON ap.invoice_id = i.id AND ap.status = 'POSTED'
  WHERE i.company_id = $1 AND i.status = 'POSTED' AND i.document_date <= $2
  GROUP BY i.id
  HAVING i.total_txn - coalesce(sum(ap.applied_txn) FILTER (WHERE ap.applied_on <= $2), 0) <> 0
),
aged AS (
  SELECT *, ($2::date - CASE WHEN $3 = 'DUE' THEN due_date ELSE document_date END) AS days
  FROM open_as_of
)
SELECT customer_id, currency,
  sum(open_txn) FILTER (WHERE days <= 0)                AS not_yet_due,   -- only meaningful for basis DUE
  sum(open_txn) FILTER (WHERE days BETWEEN 1  AND 30)   AS d_1_30,
  sum(open_txn) FILTER (WHERE days BETWEEN 31 AND 60)   AS d_31_60,
  sum(open_txn) FILTER (WHERE days BETWEEN 61 AND 90)   AS d_61_90,
  sum(open_txn) FILTER (WHERE days > 90)                AS d_90_plus,
  sum(open_txn)                                         AS total
FROM aged
GROUP BY customer_id, currency
ORDER BY total DESC;
```

* **Day arithmetic** is `date − date` (an integer number of days, not timestamps), so time zones
  cannot move an item across a bucket boundary. Business requirement "0–30" maps to `days ≤ 30`
  under invoice-date basis; under due-date basis "current" is `days ≤ 0` and 1–30 starts the day
  after due. Bucket edges are configurable rows (`aging_buckets(code, min_days, max_days)`), and
  the SQL is generated from them.
* **Unapplied credits and on-account receipts** age as negative items in their own bucket by
  receipt date, or are optionally netted per customer.
* **Currency:** aging is in transaction currency per row. Base-currency totals use the
  **closing rate at `as_of`** for the "revalued" column, plus the carrying amount; the difference
  is the unrealised FX shown in §1.3.4.
* **Tie-out:** Σ open base (carrying) across all customers MUST equal the AR_CONTROL balance at
  `as_of`. AP aging is symmetric over `ap_bills`/`ap_applications` and ties to AP_CONTROL. The
  report header shows the tie-out difference.
* **Expected credit loss (IFRS 9)** provision matrix: `ECL = Σ bucket_total × loss_rate(bucket)`,
  with loss rates from historical roll-rates; posted at period end as Dr Bad debt expense / Cr
  Allowance for doubtful debts (true-up of the difference to the existing allowance).

---

## 7. Concurrency, races & distributed data integrity

### 7.1 Inventory concurrency & over-selling prevention

**Problem.** Two requests read `available = 1` for the same SKU and warehouse, both decide to
allocate, and both commit, leaving `available = −1`. Any read-check-write sequence without
coordination has this bug. Today's `inventory.service.ts › applyStock` and the dealership
`reserveVehicle` are both read-modify-write on a document and are exposed to it (G8).

#### 7.1.1 Chosen pattern: database-enforced, row-level, with a conditional update

The authoritative guard lives in the same database transaction that records the allocation. A
Redis lock alone is never sufficient: it can expire mid-transaction (GC pause, network
partition), after which a second holder proceeds while the first still commits.

```sql
CREATE TABLE stock_positions (                 -- hot summary, one row per bucket
  tenant_id UUID, item_id UUID, warehouse_id UUID, lot_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  on_hand   NUMERIC(20,4) NOT NULL DEFAULT 0,
  allocated NUMERIC(20,4) NOT NULL DEFAULT 0,
  version   BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, item_id, warehouse_id, lot_id),
  CONSTRAINT no_oversell CHECK (allocated <= on_hand OR allow_negative),
  CONSTRAINT non_negative CHECK (on_hand >= 0 OR allow_negative),
  allow_negative BOOLEAN NOT NULL DEFAULT false
);
```

**Allocation is one atomic conditional statement** with no prior read:

```sql
UPDATE stock_positions
   SET allocated = allocated + $qty, version = version + 1
 WHERE tenant_id = $t AND item_id = $i AND warehouse_id = $w AND lot_id = $l
   AND on_hand - allocated >= $qty          -- the check happens under the row lock
RETURNING on_hand - allocated AS available_after;
-- 0 rows → ERR_INSUFFICIENT_STOCK (or try the next warehouse / lot)
```

PostgreSQL takes a row-level exclusive lock for the `UPDATE`. A second concurrent `UPDATE` on the
same row blocks until the first commits, then **re-evaluates the WHERE clause against the new row
version** (READ COMMITTED EvalPlanQual). If the last unit is gone, it updates 0 rows. That makes
it correct under the default isolation level, with a lock held only for the statement's
transaction, and the `CHECK` constraint as a second guard. The same transaction inserts the
`stock_allocations` row and the outbox event.

**Multi-line orders (deadlock avoidance).** Allocate lines in a **canonical order**: sort by
`(item_id, warehouse_id, lot_id)` before issuing the updates. Two orders that both contain SKU A
and SKU B then lock in the same order and cannot deadlock. Deadlocks (`40P01`) that still occur
(e.g. with triggers) are retried like serialization failures.

**Explicit pessimistic variant** (needed when the decision requires more logic than a WHERE clause
can express, e.g. FEFO lot selection across several lots):

```sql
BEGIN;
SELECT lot_id, on_hand - allocated AS avail
  FROM stock_positions
 WHERE tenant_id = $t AND item_id = $i AND warehouse_id = $w AND on_hand - allocated > 0
 ORDER BY lot_expiry, lot_id
 FOR UPDATE;                         -- or FOR UPDATE SKIP LOCKED for pickers grabbing work
-- choose lots in application code, then UPDATE each chosen row
COMMIT;
```

`SET lock_timeout = '2s'` bounds waiting; on timeout the API returns `409 STOCK_CONTENDED` with
`Retry-After`.

**Serialised units (vehicles, serial numbers):**

```sql
UPDATE serials SET status = 'RESERVED', reserved_for = $so_line, version = version + 1
 WHERE id = $serial AND status = 'IN_STOCK';         -- 0 rows → already taken
```

plus a partial unique index as a belt-and-braces guard:
`CREATE UNIQUE INDEX one_active_reservation ON stock_allocations (serial_id) WHERE status =
'ACTIVE';`

The same pattern in today's MongoDB code: `Vehicle.findOneAndUpdate({ _id, status: { $in:
["in_stock", "reconditioning", "in_transit"] } }, { $set: { status: "reserved", dealId } })`. That is
one atomic document operation, and a `null` result means someone else won. This should replace
the `findById` → `save()` sequence in `reserveVehicle` in Phase A.

#### 7.1.2 Where Redis fits

| Use | Pattern | Correctness role |
|---|---|---|
| Flash-sale / hot SKU throttling | `DECRBY stock:{sku}` in a Lua script that refuses below zero. A token gives the right to *attempt* the DB allocation | **Admission control only**; the DB update above is still the authority. Tokens are re-synced from the DB every 30 s and on every commit or rollback |
| Cart holds (soft reservation, TTL 15 min) | `SET hold:{cart}:{sku} qty EX 900` plus a sorted set per SKU for the held total | Advisory; displayed availability = DB available − Redis holds |
| Distributed job mutex (replenishment run, re-costing per valuation key) | Redlock is **not** used for correctness. Use `pg_try_advisory_lock` in the DB that owns the data, or Redis `SET NX PX` with a **fencing token** (monotonic counter) checked by the DB write (`WHERE fencing_token < $token`) | Fencing makes a stale lock holder's writes fail |

#### 7.1.3 Idempotency at the API edge

Every mutating endpoint accepts an `Idempotency-Key` header (UUID). The server stores `(key,
tenant, endpoint, request_hash, response, status)` with a unique key and a 24-hour TTL. A replay
with the same hash returns the stored response, and a replay with a different body returns
`422 IDEMPOTENCY_KEY_REUSED`. Checkout retries from mobile clients therefore cannot double-
allocate or double-charge.

### 7.2 Distributed ledger consistency

#### 7.2.1 Topology decision

| Option | Verdict |
|---|---|
| Single PostgreSQL for ledger + inventory (modular monolith) | **Preferred.** One ACID transaction covers stock, GL and audit, and no saga is needed for the core. Scale with read replicas, partitioning, and per-tenant sharding (Citus) when needed |
| Separate Inventory and Accounting services with their own databases | Only when team or scale boundaries force it. Then use the **orchestrated saga + transactional outbox** below |
| Two-phase commit (XA / `PREPARE TRANSACTION`) | **Rejected** for request paths: a coordinator failure leaves prepared transactions holding locks indefinitely, availability drops to the weakest participant, and most brokers and SaaS APIs cannot participate. Acceptable only for rare admin batch jobs inside one PostgreSQL cluster |

#### 7.2.2 Transactional outbox (every service)

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY, tenant_id UUID, aggregate_type TEXT, aggregate_id UUID,
  event_type TEXT, event_version INT, payload JSONB, headers JSONB,   -- trace id, causation id, idempotency key
  created_at TIMESTAMPTZ DEFAULT now(), published_at TIMESTAMPTZ
);
```

State changes and their events are written in **one local transaction**. A relay (Debezium CDC
on the WAL, or a poller using `SELECT … FOR UPDATE SKIP LOCKED LIMIT 500`) publishes to the
broker (Kafka; topic per aggregate, partition key = `aggregate_id` for ordering) and marks the
rows published. Delivery is **at-least-once**, so every consumer keeps an `inbox(message_id
PRIMARY KEY, processed_at)` table and processes a message and inserts its inbox row in the same
transaction. Together that gives effectively-once processing.

#### 7.2.3 Checkout saga (orchestrated)

The orchestrator is a durable state machine (Temporal workflow, or a `saga_instances` table driven
by the outbox):

```
                       ┌────────────── compensations run in reverse order ───────────────┐
 1 Order.Create(PENDING)        ↺ Order.Cancel
 2 Inventory.Reserve(lines)     ↺ Inventory.ReleaseReservation
 3 Payment.Authorize(amount)    ↺ Payment.VoidAuthorization
 4 Order.Confirm
 5 Inventory.Ship (on fulfilment)   — pivot: after this the saga only moves forward
 6 Accounting.PostShipment(COGS)    — retriable, never compensated
 7 Payment.Capture
 8 Accounting.PostInvoice(AR/Revenue/Tax) + PostReceipt
```

| Rule | Detail |
|---|---|
| Commands are idempotent | Each step's command carries `saga_id + step` as the idempotency key; the participant returns the original result on a duplicate |
| Pivot transaction | Steps before shipment are compensatable. Steps after it are **retriable-only**: accounting posts must eventually succeed (retry with backoff, then a dead-letter queue with an alert). A ledger is never "compensated" by deletion; if a business reversal is needed, it is a new reversing entry |
| Ordering | Accounting consumes `ShipmentPosted` and `InvoicePosted` events keyed by `order_id`. It can process them in either order because each posting is self-contained and references its source document |
| Semantic lock | While the saga is in flight, the order is `PENDING`. Other operations on it (cancel, edit) consult the saga state |
| Timeouts | Payment authorisation not completed in 15 minutes → compensate steps 2 and 1 |
| Observability | Every saga step logs `saga_id`, `step`, `attempt`, `outcome`. A dashboard shows stuck sagas (no progress in 10 minutes) |

**Failure walk-through — "accounting commit fails during high-velocity checkout":** the shipment
is already committed in the Inventory DB together with its outbox row `ShipmentPosted`. The
Accounting consumer's transaction (insert journal + inbox row) fails, for example on a
serialization conflict or the DB being briefly down. Nothing is acknowledged, so the broker
redelivers. The consumer retries with exponential backoff; the inbox row prevents a double post
once one attempt succeeds. If the failure is a *business* rejection (e.g. `ERR_PERIOD_CLOSED`
because the shipment's date fell into a just-closed period), the message goes to a dead-letter
queue with the reason, finance is alerted, and the reconciliation below flags the gap until
someone posts it to the next open period. Stock and ledger may disagree for seconds to minutes,
never permanently, and the disagreement is always visible.

#### 7.2.4 Continuous reconciliation

| Check | Frequency | Action on mismatch |
|---|---|---|
| Σ `inventory_ledger.value_base` per (company, inventory account) vs GL balance of that account | Every 15 min (incremental), full nightly | Alert; list source documents with an inventory row but no journal (anti-join on `source_id`) |
| Shipped-not-posted: `ShipmentPosted` events older than 10 min without a matching journal | Every 5 min | Re-publish event; page on-call after 3 attempts |
| AR sub-ledger vs AR_CONTROL, AP vs AP_CONTROL | Hourly | Alert, and block period close |
| Payment provider settlements vs receipts | Daily | Exceptions queue in bank reconciliation |

---

## 8. Database schema blueprint & API matrix

### 8.1 Core relational schema (PostgreSQL 16)

Conventions: every table has `tenant_id` as the first PK/index column (row-level security
policy `tenant_id = current_setting('app.tenant_id')::uuid`); `created_at`, `created_by`,
`updated_at`, `version` columns are implied on mutable tables and omitted below for brevity;
money and quantity are `NUMERIC(20,4)`; enumerations use `TEXT + CHECK` (portable, easy to extend
without `ALTER TYPE` locks).

```sql
-- =====================================================================  accounts
CREATE TABLE accounts (
  id               UUID PRIMARY KEY,
  tenant_id        UUID NOT NULL,
  company_id       UUID NOT NULL,
  code             TEXT NOT NULL CHECK (code ~ '^[A-Z0-9]{2,12}$'),
  name             TEXT NOT NULL,
  parent_id        UUID REFERENCES accounts(id),
  path             LTREE NOT NULL,
  depth            SMALLINT NOT NULL CHECK (depth BETWEEN 1 AND 8),
  account_class    TEXT NOT NULL CHECK (account_class IN
                   ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE','OTHER','TAX','STATISTICAL')),
  normal_balance   CHAR(1) NOT NULL CHECK (normal_balance IN ('D','C')),
  is_postable      BOOLEAN NOT NULL DEFAULT false,
  is_cash          BOOLEAN NOT NULL DEFAULT false,
  is_control       BOOLEAN NOT NULL DEFAULT false,      -- fed only by a sub-ledger
  system_key       TEXT,                                -- RETAINED_EARNINGS, AR_CONTROL, …
  currency_mode    TEXT NOT NULL DEFAULT 'ANY' CHECK (currency_mode ~ '^(ANY|BASE_ONLY|FIXED:[A-Z]{3})$'),
  cash_flow_category TEXT,
  report_tags      TEXT[] NOT NULL DEFAULT '{}',        -- 'D&A', 'NON_CASH', …
  is_active        BOOLEAN NOT NULL DEFAULT true,
  valid_from       DATE NOT NULL DEFAULT DATE '1900-01-01',
  valid_to         DATE,
  UNIQUE (tenant_id, company_id, code),
  UNIQUE (tenant_id, company_id, system_key),           -- NULLs are distinct, so many non-system accounts are fine
  CHECK (NOT is_control OR is_postable),               -- control accounts receive sub-ledger lines
  CHECK (NOT is_cash OR account_class = 'ASSET')
);
CREATE INDEX accounts_path_gist   ON accounts USING GIST (path);
CREATE INDEX accounts_parent      ON accounts (tenant_id, parent_id);
CREATE INDEX accounts_postable    ON accounts (tenant_id, company_id) WHERE is_postable AND is_active;

-- =====================================================================  journal_entries
CREATE TABLE journal_entries (
  id                   UUID PRIMARY KEY,
  tenant_id            UUID NOT NULL,
  company_id           UUID NOT NULL,
  entry_number         TEXT,                             -- gap-free per (company, journal_type, fiscal_year), set at POST
  journal_type         TEXT NOT NULL CHECK (journal_type IN
                       ('GENERAL','SALES','PURCHASE','CASH_RECEIPT','CASH_PAYMENT','INVENTORY',
                        'PAYROLL','FX_REVALUATION','DEPRECIATION','ALLOCATION','INTERCOMPANY',
                        'YEAR_END_CLOSE','OPENING','ADJUSTMENT')),
  status               TEXT NOT NULL CHECK (status IN
                       ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','POSTED','REVERSED','DISCARDED')),
  document_date        DATE NOT NULL,
  posting_date         DATE NOT NULL,
  period_id            UUID REFERENCES accounting_periods(id),   -- resolved at POST
  currency             CHAR(3) NOT NULL,                 -- header/default TC
  description          TEXT NOT NULL,
  source_module        TEXT NOT NULL,                    -- GL, AR, AP, INV, MFG, BANK, DEALERSHIP
  source_type          TEXT NOT NULL,
  source_id            UUID,
  source_version       INT NOT NULL DEFAULT 1,
  auto_reverse         BOOLEAN NOT NULL DEFAULT false,
  reverse_on           DATE,
  reverses_entry_id    UUID REFERENCES journal_entries(id),
  reversed_by_entry_id UUID REFERENCES journal_entries(id),
  ic_transaction_id    UUID,
  correction_of_entry_id  UUID REFERENCES journal_entries(id),
  correction_of_period_id UUID REFERENCES accounting_periods(id),
  reason               TEXT,
  total_debit_base     NUMERIC(20,4) NOT NULL DEFAULT 0,  -- denormalised; verified by trigger
  total_credit_base    NUMERIC(20,4) NOT NULL DEFAULT 0,
  posted_at            TIMESTAMPTZ,
  posted_by            UUID,
  approved_by          UUID,
  idempotency_key      UUID NOT NULL,
  CHECK (status <> 'POSTED' OR (entry_number IS NOT NULL AND posted_at IS NOT NULL AND period_id IS NOT NULL)),
  CHECK (total_debit_base = total_credit_base OR status NOT IN ('POSTED','REVERSED')),
  CHECK (NOT auto_reverse OR reverse_on > posting_date),
  CHECK (reason IS NOT NULL OR (reverses_entry_id IS NULL AND correction_of_entry_id IS NULL AND correction_of_period_id IS NULL)),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, company_id, journal_type, entry_number)
);
CREATE UNIQUE INDEX je_source_once ON journal_entries (tenant_id, source_type, source_id, source_version)
  WHERE source_id IS NOT NULL AND status IN ('POSTED','REVERSED');
CREATE INDEX je_period      ON journal_entries (tenant_id, company_id, posting_date) WHERE status IN ('POSTED','REVERSED');
CREATE INDEX je_reverse_due ON journal_entries (reverse_on) WHERE auto_reverse AND reversed_by_entry_id IS NULL AND status = 'POSTED';

-- =====================================================================  journal_lines
-- (base definition in §1.2.1; full column list repeated here)
CREATE TABLE journal_lines (
  id              UUID NOT NULL,
  tenant_id       UUID NOT NULL,
  entry_id        UUID NOT NULL,
  posting_date    DATE NOT NULL,                      -- copied from header for partition pruning
  line_no         INT  NOT NULL,
  combination_id  UUID NOT NULL REFERENCES gl_combinations(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  department_code TEXT, location_code TEXT, project_code TEXT,   -- denormalised segments for reports
  party_type      TEXT CHECK (party_type IN ('CUSTOMER','SUPPLIER','EMPLOYEE','BANK','INTERCOMPANY')),
  party_id        UUID,
  debit_txn       NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit_txn  >= 0),
  credit_txn      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit_txn >= 0),
  currency        CHAR(3) NOT NULL,
  fx_rate         NUMERIC(24,12) NOT NULL CHECK (fx_rate > 0),
  fx_rate_path    JSONB,
  debit_base      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit_base  >= 0),
  credit_base     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  is_base_only    BOOLEAN NOT NULL DEFAULT false,
  quantity        NUMERIC(20,4),                      -- statistical / inventory qty
  tax_code        TEXT,
  description     TEXT,
  source_line_id  UUID,                               -- invoice line, inventory_ledger row…
  reconciled_at   TIMESTAMPTZ,                        -- bank rec / open-item clearing
  CONSTRAINT one_side_txn  CHECK (is_base_only OR ((debit_txn > 0) <> (credit_txn > 0))),
  CONSTRAINT base_only_txn CHECK (NOT is_base_only OR (debit_txn = 0 AND credit_txn = 0)),
  CONSTRAINT one_side_base CHECK ((debit_base > 0) <> (credit_base > 0)),
  CONSTRAINT same_side     CHECK (is_base_only OR ((debit_txn > 0) = (debit_base > 0))),
  PRIMARY KEY (posting_date, id),
  UNIQUE (posting_date, entry_id, line_no)
) PARTITION BY RANGE (posting_date);                  -- monthly partitions, created 3 months ahead
-- FK entry_id → journal_entries enforced by trigger (FKs into partitioned parents are supported
-- in PG ≥ 12, but the deferred balance trigger already validates the entry exists).
CREATE INDEX jl_account_date ON journal_lines (tenant_id, account_id, posting_date) INCLUDE (debit_base, credit_base);
CREATE INDEX jl_entry        ON journal_lines (entry_id);
CREATE INDEX jl_party_open   ON journal_lines (tenant_id, party_type, party_id) WHERE reconciled_at IS NULL;
CREATE INDEX jl_source_line  ON journal_lines (source_line_id) WHERE source_line_id IS NOT NULL;

-- =====================================================================  warehouses
CREATE TABLE warehouses (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  company_id      UUID NOT NULL,
  code            TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{2,12}$'),
  name            TEXT NOT NULL,
  warehouse_type  TEXT NOT NULL CHECK (warehouse_type IN
                  ('STANDARD','TRANSIT','CONSIGNMENT_OUT','CONSIGNMENT_IN','QUARANTINE','3PL','SHOWROOM','VIRTUAL')),
  location_code   TEXT NOT NULL,                      -- GL location segment
  address         JSONB,
  geo             POINT,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Karachi',
  inventory_account_id UUID REFERENCES accounts(id),   -- overrides category account when set
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  external_ref    JSONB NOT NULL DEFAULT '{}',          -- {"shopify_location_id": "...", "3pl_code": "..."}
  UNIQUE (tenant_id, code)
);
CREATE TABLE bins (id UUID PRIMARY KEY, warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  code TEXT NOT NULL, zone TEXT, pick_sequence INT, capacity_qty NUMERIC(20,4), UNIQUE (warehouse_id, code));

-- =====================================================================  items
CREATE TABLE items (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  sku                 TEXT NOT NULL CHECK (sku ~ '^[A-Z0-9._/-]{1,40}$'),
  name                TEXT NOT NULL,
  item_type           TEXT NOT NULL CHECK (item_type IN ('STOCK','NON_STOCK','SERVICE','KIT','VEHICLE','FIXED_ASSET')),
  category_id         UUID NOT NULL,
  base_uom            TEXT NOT NULL,
  tracking            TEXT NOT NULL DEFAULT 'NONE' CHECK (tracking IN ('NONE','LOT','SERIAL','LOT_AND_SERIAL')),
  costing_method      TEXT NOT NULL CHECK (costing_method IN ('FIFO','MAC','STANDARD','SPECIFIC')),
  standard_cost       NUMERIC(20,6),
  inventory_account_id UUID REFERENCES accounts(id),
  cogs_account_id     UUID REFERENCES accounts(id),
  revenue_account_id  UUID REFERENCES accounts(id),
  product_tax_code    TEXT,
  hs_code             TEXT,
  gross_weight_kg     NUMERIC(20,4),
  volume_m3           NUMERIC(20,6),
  shelf_life_days     INT CHECK (shelf_life_days > 0),
  min_receipt_shelf_life_pct NUMERIC(5,2),
  serial_pattern      TEXT,                           -- regex, e.g. VIN '^[A-HJ-NPR-Z0-9]{17}$'
  warranty_months     INT,
  abc_class           CHAR(1) CHECK (abc_class IN ('A','B','C')),
  replenishment_method TEXT NOT NULL DEFAULT 'NONE' CHECK (replenishment_method IN ('NONE','ROP','MIN_MAX','MRP')),
  over_ship_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  return_days         INT,
  attributes          JSONB NOT NULL DEFAULT '{}',    -- make/model/year for vehicles, size/colour variants
  is_active           BOOLEAN NOT NULL DEFAULT true,
  external_ref        JSONB NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, sku),
  CHECK (costing_method <> 'STANDARD' OR standard_cost IS NOT NULL),
  CHECK (costing_method <> 'SPECIFIC' OR tracking IN ('SERIAL','LOT_AND_SERIAL')),
  CHECK (item_type NOT IN ('SERVICE','NON_STOCK') OR tracking = 'NONE')
);
CREATE INDEX items_category ON items (tenant_id, category_id) WHERE is_active;
CREATE INDEX items_attrs    ON items USING GIN (attributes jsonb_path_ops);
CREATE INDEX items_name_trgm ON items USING GIN (name gin_trgm_ops);   -- pg_trgm search

-- =====================================================================  inventory_ledger
-- Single source of truth for stock quantity AND value. Append-only.
CREATE TABLE inventory_ledger (
  id                UUID NOT NULL,
  tenant_id         UUID NOT NULL,
  company_id        UUID NOT NULL,
  movement_date     DATE NOT NULL,
  seq               BIGINT NOT NULL,                  -- ordering within valuation key (§2.1.1)
  movement_type     TEXT NOT NULL CHECK (movement_type IN
                    ('RECEIPT','ISSUE','SHIPMENT','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT_IN','ADJUSTMENT_OUT',
                     'PRODUCTION_ISSUE','PRODUCTION_RECEIPT','RETURN_IN','RETURN_OUT','REVALUATION',
                     'LANDED_COST','STATUS_CHANGE','CONSIGNMENT_IN','CONSIGNMENT_OUT','OPENING')),
  item_id           UUID NOT NULL REFERENCES items(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  bin_id            UUID REFERENCES bins(id),
  lot_id            UUID REFERENCES lots(id),
  serial_id         UUID REFERENCES serials(id),
  ownership         TEXT NOT NULL DEFAULT 'OURS' CHECK (ownership IN ('OURS','SUPPLIER_CONSIGNMENT','CUSTOMER_OWNED')),
  stock_status      TEXT NOT NULL DEFAULT 'AVAILABLE',
  qty               NUMERIC(20,4) NOT NULL,           -- signed, base UoM
  value_base        NUMERIC(20,4) NOT NULL,           -- signed
  unit_cost         NUMERIC(20,6) GENERATED ALWAYS AS (CASE WHEN qty <> 0 THEN abs(value_base / qty) END) STORED,
  running_qty       NUMERIC(20,4) NOT NULL,           -- per valuation key after this row (MAC restart point)
  running_value     NUMERIC(20,4) NOT NULL,
  cost_status       TEXT NOT NULL DEFAULT 'FINAL' CHECK (cost_status IN ('FINAL','PROVISIONAL')),
  source_type       TEXT NOT NULL,                    -- GRN, DELIVERY_NOTE, TRANSFER, COUNT, PROD_ORDER, RMA, LANDED_COST…
  source_id         UUID NOT NULL,
  source_line_id    UUID NOT NULL,
  reverses_ledger_id UUID,                            -- returns / reversals reference the original issue
  journal_entry_id  UUID,                             -- the GL entry posted with this movement
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  CHECK (movement_type IN ('REVALUATION','LANDED_COST','STATUS_CHANGE') OR qty <> 0),
  CHECK (movement_type NOT IN ('REVALUATION','LANDED_COST') OR qty = 0),
  CHECK (movement_type <> 'STATUS_CHANGE' OR value_base = 0),
  CHECK (ownership = 'OURS' OR value_base = 0),       -- consignment-in carries no value
  CHECK (serial_id IS NULL OR abs(qty) IN (0, 1)),
  PRIMARY KEY (movement_date, id)
) PARTITION BY RANGE (movement_date);
CREATE INDEX il_item_wh_date ON inventory_ledger (tenant_id, item_id, warehouse_id, movement_date, seq)
  INCLUDE (qty, value_base);
CREATE INDEX il_source       ON inventory_ledger (source_type, source_id);
CREATE INDEX il_lot          ON inventory_ledger (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX il_serial       ON inventory_ledger (serial_id) WHERE serial_id IS NOT NULL;
CREATE INDEX il_unposted_gl  ON inventory_ledger (tenant_id, created_at) WHERE journal_entry_id IS NULL AND value_base <> 0;
-- Same immutability trigger pattern as journal_lines (no UPDATE/DELETE), except journal_entry_id
-- may be set once from NULL.

-- =====================================================================  purchase_order_lines
CREATE TABLE purchase_order_lines (
  id                UUID PRIMARY KEY,
  tenant_id         UUID NOT NULL,
  po_id             UUID NOT NULL REFERENCES purchase_orders(id),
  line_no           INT NOT NULL,
  line_type         TEXT NOT NULL CHECK (line_type IN ('ITEM','SERVICE','LANDED_COST','FIXED_ASSET')),
  item_id           UUID REFERENCES items(id),
  description       TEXT NOT NULL,
  warehouse_id      UUID REFERENCES warehouses(id),
  combination_id    UUID REFERENCES gl_combinations(id),    -- for non-stock lines
  uom               TEXT NOT NULL,
  uom_factor        NUMERIC(20,10) NOT NULL DEFAULT 1,
  qty_ordered       NUMERIC(20,4) NOT NULL CHECK (qty_ordered > 0),
  qty_received      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_returned      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0),
  qty_billed        NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_billed >= 0),
  qty_cancelled     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_cancelled >= 0),
  unit_price        NUMERIC(20,6) NOT NULL CHECK (unit_price >= 0),
  discount_pct      NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  line_amount       NUMERIC(20,4) NOT NULL,           -- qty_ordered × unit_price × (1 − disc)
  tax_code          TEXT,
  tax_amount        NUMERIC(20,4) NOT NULL DEFAULT 0,
  estimated_landed_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  qty_over_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  price_over_pct    NUMERIC(5,2) NOT NULL DEFAULT 1,
  receipt_required  BOOLEAN NOT NULL DEFAULT true,
  promised_date     DATE,
  requisition_line_id UUID,
  status            TEXT NOT NULL CHECK (status IN ('OPEN','PARTIALLY_RECEIVED','RECEIVED','PARTIALLY_BILLED','BILLED','CLOSED','CANCELLED')),
  UNIQUE (po_id, line_no),
  CHECK (line_type <> 'ITEM' OR (item_id IS NOT NULL AND warehouse_id IS NOT NULL)),
  CHECK (line_type = 'ITEM' OR combination_id IS NOT NULL),
  CHECK (qty_received - qty_returned <= qty_ordered * (1 + qty_over_pct / 100)),
  CHECK (qty_billed <= CASE WHEN receipt_required THEN qty_received - qty_returned ELSE qty_ordered END),
  CHECK (qty_cancelled <= qty_ordered - (qty_received - qty_returned))
);
CREATE INDEX pol_open_by_item ON purchase_order_lines (tenant_id, item_id, warehouse_id)
  WHERE status IN ('OPEN','PARTIALLY_RECEIVED');           -- on-order qty for replenishment IP
CREATE INDEX pol_grni         ON purchase_order_lines (tenant_id, po_id)
  WHERE qty_received - qty_returned > qty_billed;          -- GRNI aging

-- =====================================================================  sales_order_lines
CREATE TABLE sales_order_lines (
  id                UUID PRIMARY KEY,
  tenant_id         UUID NOT NULL,
  so_id             UUID NOT NULL REFERENCES sales_orders(id),
  line_no           INT NOT NULL,
  line_type         TEXT NOT NULL CHECK (line_type IN ('ITEM','SERVICE','KIT','VEHICLE','FEE','DISCOUNT')),
  item_id           UUID REFERENCES items(id),
  serial_id         UUID REFERENCES serials(id),      -- vehicle / serial-specific sale
  description       TEXT NOT NULL,
  warehouse_id      UUID REFERENCES warehouses(id),
  uom               TEXT NOT NULL,
  uom_factor        NUMERIC(20,10) NOT NULL DEFAULT 1,
  qty_ordered       NUMERIC(20,4) NOT NULL CHECK (qty_ordered > 0),
  qty_allocated     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_allocated >= 0),
  qty_shipped       NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_shipped >= 0),
  qty_invoiced      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  qty_returned      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0),
  qty_cancelled     NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (qty_cancelled >= 0),
  qty_backordered   NUMERIC(20,4) GENERATED ALWAYS AS
                    (greatest(qty_ordered - qty_cancelled - qty_shipped - qty_allocated, 0)) STORED,
  list_price        NUMERIC(20,6) NOT NULL,
  unit_price        NUMERIC(20,6) NOT NULL CHECK (unit_price >= 0),
  discount_pct      NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  line_amount       NUMERIC(20,4) NOT NULL,
  tax_code          TEXT,
  tax_amount        NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_content_version TEXT,
  cost_estimate     NUMERIC(20,4),                    -- at order time, for margin approval
  over_ship_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  requested_date    DATE,
  promised_date     DATE,
  revenue_recognition TEXT NOT NULL DEFAULT 'POINT_IN_TIME' CHECK (revenue_recognition IN ('POINT_IN_TIME','OVER_TIME','MILESTONE')),
  external_line_ref TEXT,                              -- Shopify line_item_id, Amazon OrderItemId
  status            TEXT NOT NULL CHECK (status IN ('OPEN','BACKORDERED','ALLOCATED','PARTIALLY_SHIPPED','SHIPPED','INVOICED','CLOSED','CANCELLED')),
  UNIQUE (so_id, line_no),
  CHECK (line_type NOT IN ('ITEM','KIT','VEHICLE') OR item_id IS NOT NULL),
  CHECK (line_type <> 'VEHICLE' OR (serial_id IS NOT NULL AND qty_ordered = 1)),
  CHECK (qty_allocated + qty_shipped <= qty_ordered - qty_cancelled + qty_ordered * over_ship_pct / 100),
  CHECK (qty_shipped <= qty_ordered * (1 + over_ship_pct / 100)),
  CHECK (qty_returned <= qty_shipped)
);
CREATE INDEX sol_open_by_item ON sales_order_lines (tenant_id, item_id, warehouse_id)
  WHERE status IN ('OPEN','BACKORDERED','ALLOCATED','PARTIALLY_SHIPPED');   -- committed demand / ATP
CREATE INDEX sol_unbilled     ON sales_order_lines (tenant_id, so_id) WHERE qty_shipped > qty_invoiced;
CREATE UNIQUE INDEX sol_external ON sales_order_lines (tenant_id, external_line_ref) WHERE external_line_ref IS NOT NULL;
```

**Supporting tables** referenced above (same conventions, abbreviated): `companies`,
`gl_segments`, `gl_segment_values`, `gl_combinations`, `account_balances`, `accounting_periods`,
`fiscal_years`, `number_sequences`, `fx_rates`, `cost_layers`, `cost_consumptions`,
`stock_positions`, `stock_allocations`, `lots`, `serials`, `serial_events`, `purchase_orders`,
`sales_orders`, `grn_lines`, `delivery_lines`, `ar_invoices`, `ar_applications`, `ap_bills`,
`ap_applications`, `bank_statements`, `bank_lines`, `bank_matches`, `tax_transactions`,
`audit_log`, `outbox`, `inbox`, `idempotency_keys`.

**Partitioning & retention:** `journal_lines`, `inventory_ledger` and `audit_log` are partitioned
monthly by date (`pg_partman`). Partitions of permanently locked years are set read-only by
revoking `INSERT` and moving them to a read-only tablespace. Indexes on partitions are local.
Expected sizing for 10 M lines/year: ≈ 2.5 GB/year for lines including indexes.

### 8.2 API-first headless architecture

#### 8.2.1 API surface

* **REST** (`/api/v1`), JSON, OpenAPI 3.1 spec as the contract, generated SDKs. **GraphQL**
  (`/graphql`) is read-mostly for dashboards and reports (persisted queries only, depth limit 8,
  cost analysis to block expensive queries). Writes go through REST commands.
* **Auth:** OAuth 2.1 client-credentials for server-to-server integrations, authorization code +
  PKCE for user apps, scopes per resource (`inventory:read`, `orders:write`, `ledger:post`…). Every
  token is bound to one tenant. Optional mTLS for 3PL partners.
* **Conventions:** money as strings with explicit currency (`{"amount":"1250.0000","currency":
  "PKR"}`); cursor pagination (`?cursor=…&limit=100`, max 500); `ETag` + `If-Match` for optimistic
  concurrency on updates (`412` on mismatch); `Idempotency-Key` required on every POST (§7.1.3);
  RFC 9457 problem+json errors with stable `code` values (`ERR_PERIOD_CLOSED`…); rate limits per
  client (token bucket, `429` with `Retry-After` and `RateLimit-*` headers).

#### 8.2.2 Endpoint matrix

| Resource | Endpoints | Notes |
|---|---|---|
| Items | `GET/POST /items`, `GET/PATCH /items/{id}`, `GET /items/{id}/availability?warehouse=` | Availability returns on_hand, allocated, available, ATP by date |
| Inventory | `GET /inventory/positions`, `GET /inventory/ledger?item=&from=&to=`, `POST /inventory/adjustments`, `POST /inventory/transfers`, `POST /inventory/counts` | Ledger is read-only; changes only through documents |
| Allocations | `POST /allocations` (hold stock for an external order), `DELETE /allocations/{id}` (release) | Atomic per §7.1 |
| Sales orders | `POST /sales-orders`, `GET /sales-orders/{id}`, `POST /sales-orders/{id}:confirm`, `:cancel`, `:hold` | `external_ref` unique per channel → idempotent order import |
| Fulfilment | `POST /deliveries` (ship), `POST /deliveries/{id}/tracking` | 3PL posts shipments here |
| Invoices / credit notes | `POST /invoices`, `POST /credit-notes`, `GET /invoices/{id}/pdf` | |
| Payments | `POST /receipts`, `POST /receipts/{id}:apply`, `POST /payment-runs` | |
| Purchasing | `POST /purchase-orders`, `POST /grns`, `POST /supplier-invoices` (enters 3-way match) | |
| Ledger | `POST /journal-entries` (scope `ledger:post`), `POST /journal-entries/{id}:reverse`, `GET /trial-balance?as_of=`, `GET /reports/{bs|pl|cf}` | No PUT/DELETE on posted entries |
| Parties | `GET/POST /customers`, `/suppliers`; `POST /customers/{id}/exemption-certificates` | |
| Webhooks | `GET/POST /webhook-subscriptions`, `POST /webhook-subscriptions/{id}:rotate-secret`, `GET /webhook-deliveries?status=failed`, `POST /webhook-deliveries/{id}:redeliver` | |
| Dealership | `GET /vehicles`, `POST /vehicles/{id}:publish`, `POST /deals`, `POST /deals/{id}:deliver`; public `GET /site/cars`, `POST /site/cars/{id}` (inquiry), `POST /site/sell-car` | Already implemented as Next.js routes under `/api/dealership/*` and `/api/site/*` |

#### 8.2.3 Outbound webhooks

**Envelope** (CloudEvents 1.0 JSON format):

```json
{
  "specversion": "1.0",
  "id": "01J9Z6Q4R4WJ6P3Q9S8V2K7M1N",
  "source": "https://erp.example.com/tenants/7b1e…",
  "type": "inventory.position.changed.v1",
  "time": "2026-10-16T09:12:44.512Z",
  "subject": "items/9f2c…/warehouses/MAIN",
  "datacontenttype": "application/json",
  "data": {
    "item_id": "9f2c…", "sku": "TOY-COR-ALTIS", "warehouse_code": "MAIN",
    "on_hand": "12.0000", "allocated": "3.0000", "available": "9.0000",
    "ledger_seq": 884213, "caused_by": { "type": "delivery_note", "id": "c41a…" }
  }
}
```

**Headers:** `Webhook-Id`, `Webhook-Timestamp`, `Webhook-Signature: v1,<base64 HMAC-SHA256(secret,
id + "." + timestamp + "." + body)>` (Standard Webhooks spec). Receivers reject timestamps older
than 5 minutes, which stops replay attacks. Two secrets are valid during rotation.

**Delivery:** from the outbox; at-least-once; retries at 1 m, 5 m, 30 m, 2 h, 6 h, 12 h, 24 h,
then the delivery is marked failed and the subscription is disabled after 3 days of continuous
failure (with email to the owner). Ordering is per `subject` (a per-subject queue), and receivers
should also use `ledger_seq` to discard stale updates.

**Event catalogue:** `item.created|updated`, `inventory.position.changed`, `inventory.low_stock`,
`sales_order.created|confirmed|cancelled`, `delivery.shipped`, `invoice.posted`, `payment.received`,
`credit_note.posted`, `purchase_order.approved`, `grn.posted`, `journal_entry.posted`,
`period.closed`, `vehicle.published|reserved|sold`, `lead.created` (dealership web enquiries).

#### 8.2.4 Channel adapters

Each adapter is a separate worker with its own credentials vault entry, a mapping table
(`channel_mappings(channel, entity_type, internal_id, external_id, last_synced_at, hash)`), and a
dead-letter queue.

| Channel | Inbound to ERP | Outbound from ERP | Specifics |
|---|---|---|---|
| **Shopify** | Webhooks `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, verified with `X-Shopify-Hmac-Sha256` (HMAC of raw body with the app secret). Order → SO with `external_ref = order.id`, lines by `line_item.id`; payment captured → receipt into the Shopify clearing account; refunds → credit note + refund | Inventory levels via GraphQL Admin API `inventorySetQuantities` (absolute quantities with `compareQuantity` for safety) per `location_id`; fulfilment via `fulfillmentCreate` with tracking | Payouts reconcile through the payout report: gross sales − fees − refunds = bank deposit (§1.5.3). GraphQL cost-based throttling: respect `throttleStatus` and back off |
| **Amazon Seller Central (SP-API)** | Notifications (SQS) `ORDER_CHANGE`; poll `getOrders` with `LastUpdatedAfter` as fallback; FBA inventory via `getInventorySummaries`; settlement reports (`GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE`) | MFN quantities via the Listings Items API (`patchListingsItem` fulfilment availability), or a JSON listings feed for bulk; shipment confirmation `confirmShipment` | FBA stock is modelled as a `3PL` warehouse owned by us; Amazon's inventory adjustments become ledger adjustments with reason codes. Settlement report lines map to AR clearing, fees, refunds, reimbursements and reserves. LWA OAuth tokens refreshed hourly. Per-operation rate limits (token bucket per the `x-amzn-RateLimit-Limit` header) |
| **Salesforce CRM** | Platform Events / Change Data Capture for `Opportunity` Closed Won → SO draft; `Account` → customer (match on external ID field `ERP_Customer_Id__c`) | Upsert via REST/Bulk API 2.0 on external IDs: customer credit status, open AR balance, invoice and payment history, product catalogue and price books | Bi-directional ownership is explicit per field (CRM owns contact info, ERP owns credit limit, balances and tax IDs) to prevent sync loops. `last_modified_by_integration` guards against echo |
| **3PL / carriers** | Shipment confirmations (EDI 945 / API), receipt confirmations (EDI 944), inventory snapshots (EDI 846) | Shipment orders (EDI 940), ASN for inbound (EDI 856), item master | Daily snapshot vs ERP position → variance report; variances above tolerance create count tasks instead of auto-adjusting. Carrier labels and rates via a carrier aggregator (e.g. EasyPost/Shippo) or a local courier API (TCS, Leopards, M&P in Pakistan) |
| **Car marketplaces** (PakWheels, OLX Autos) | Lead e-mails / lead API → `DealerCustomer` with `source` = channel | Listing feed (vehicle, photos, price, inspection score) when the portal supports dealer feeds; otherwise CSV/XML export for bulk upload | The listing projection already exists (`marketplace.service.ts › toPublic`), so a feed is a thin serializer over it. Never export cost, floor price or full VIN |

**Sync guarantees for stock to channels:** push absolute values (not deltas), debounce bursts
to at most one push per SKU per 30 s, and keep a **channel safety buffer** (`publish_qty =
max(0, available − buffer)`) for SKUs sold on several channels, so latency between channels
cannot oversell the last units.

---

## 9. Dealership vertical & dashboard integration

### 9.1 Built in this repository

| Capability | Where |
|---|---|
| Vehicle stock with specific-identification cost (purchase + reconditioning), floor price, aging, branch transfer | `/dealership?tab=inventory`, `dealership.service.ts › vehicleService` |
| Lead CRM: pipeline board, scoring, trade-in valuation, activity timeline, follow-ups | `/dealership?tab=customers` |
| Deal desk: live deal sheet, EMI calculator and amortisation, 6-step retail checklist, receipts, lender approval, delivery, cancellation, printable buyer's order, audit trail | `/dealership?tab=deals` |
| Ledger postings for vehicle cost, recon, receipts, lender payout, trade-in payoff | via `accountingService.upsertLinked` |
| **Public marketplace (PakWheels-style)**: `/cars` search with faceted filters and pagination; `/cars/[id]` with gallery, specs, inspection report, fair-price meter, finance calculator, similar cars, SEO metadata; `/sell-car` valuation request | `src/app/(site)/cars`, `marketplace.service.ts` |
| Web enquiries and sell-my-car requests → CRM leads (source `website`, follow-up due now), honeypot + per-IP rate limit + duplicate suppression | `POST /api/site/cars/{id}`, `POST /api/site/sell-car` |
| 8-category weighted inspection report (score 0–10) with trust badge | Vehicle detail sheet → "Record inspection" |
| Fair-market price: comps of same make/model ±2 years, normalised for year (≈6 %/yr) and mileage (≈1.5 %/10,000 km), median of ≥3; rated *great / fair / above market* | `src/lib/dealership.ts › priceInsight` |
| Marketplace analytics: live listings, views, enquiries, conversion, web leads, top-viewed cars | Dealership Overview → "Online marketplace" |
| **Main ERP dashboard card**: cars in stock, stock at cost, sold this month, gross MTD, open deals, follow-ups due, web leads (7 d), live listings — each tile links into the module | `/dashboard` (admin + staff), `dashboard.service.ts › forSession` → `dealershipSnapshot()` |

### 9.2 Next increments (PakWheels parity and beyond)

| # | Feature | Design notes |
|---|---|---|
| D1 | Correct deposit accounting | Customer deposits → `CUSTOMER_DEPOSITS` liability, recognise revenue at delivery (§4.1.6). Phase A |
| D2 | Atomic reservation | Replace `findById`→`save` with conditional `findOneAndUpdate` (§7.1.1); wrap delivery in a MongoDB transaction (G4) |
| D3 | Photo uploads | Signed direct-to-object-storage uploads (S3/R2), server-side resize to 3 sizes + WebP, EXIF stripping; listing stores asset IDs instead of URLs |
| D4 | Saved searches & price-drop alerts | `saved_searches(customer_phone/email, filters JSONB, last_notified_at)`; nightly job matches new or repriced listings → WhatsApp/SMS/e-mail. Uses existing notification toggles in Settings |
| D5 | Compare up to 3 cars | Client-side selection stored in `localStorage`; `/cars/compare?ids=` server page reusing `toPublic` |
| D6 | Auction / bidding for trade-ins | `auctions(vehicle_id, reserve_price, ends_at)`, `bids(auction_id, dealer_id, amount)`; bid placement is a conditional update `WHERE amount < $bid AND ends_at > now()` (same race-free pattern as §7.1) with anti-sniping extension |
| D7 | Portal syndication | Feed to PakWheels/OLX dealer accounts where an API exists (§8.2.4), lead e-mail parser otherwise |
| D8 | Service & warranty | Serial lifecycle (§2.4.2) for sold vehicles: service bookings, job cards, parts issues from inventory, warranty claims |
| D9 | Bank financing integration | Submit financing applications to partner banks, receive approval webhooks into `deal.financing.status` |
| D10 | Valuation model upgrade | Replace the heuristic with a gradient-boosted model trained on own sales + listings (features: make, model, variant, year, km, city, inspection score, colour, days listed); keep the heuristic as fallback when a segment has < 30 samples |
| D11 | Mobile app | The public `/api/site/*` and staff `/api/dealership/*` endpoints become the API for a React Native app (staff: photo capture, inspection on a tablet, deal desk; buyers: search, alerts, chat) |

---

## Appendix A — Error code catalogue (stable API contract)

| Code | HTTP | Meaning |
|---|---|---|
| `ERR_ENTRY_UNBALANCED` | 422 | Σ debit_base ≠ Σ credit_base |
| `ERR_ENTRY_TOO_FEW_LINES` | 422 | Fewer than two lines |
| `ERR_POSTED_ENTRY_IMMUTABLE` | 409 | Attempt to change a posted entry |
| `ERR_LEDGER_APPEND_ONLY` | 409 | Attempt to delete ledger rows |
| `ERR_PERIOD_CLOSED` / `ERR_PERIOD_SOFT_CLOSED` / `ERR_MODULE_CLOSED` / `ERR_NO_PERIOD` | 409 | Period gate (§5.3.2) |
| `ERR_RESERVED_ACCOUNT_SOURCE` | 422 | Source not allowed on a reserved account |
| `ERR_ACCOUNT_NOT_POSTABLE` / `ERR_CVR_VIOLATION` / `ERR_ACCOUNT_CURRENCY` | 422 | CoA rules |
| `ERR_DUPLICATE_SOURCE` | 409 | Source document already posted |
| `ERR_FX_ROUNDING_EXCEEDED` / `WARN_FX_STALE` | 422 / 200 | FX engine |
| `ERR_INSUFFICIENT_STOCK` | 409 | Allocation or issue would oversell |
| `STOCK_CONTENDED` | 409 | Lock timeout; retry after header |
| `ERR_SERIAL_CONCURRENT_CHANGE` | 409 | Optimistic lock failure on a serial |
| `ERR_BOM_CYCLE` | 422 | BOM references itself |
| `ERR_STATEMENT_DOES_NOT_FOOT` | 422 | Opening + lines ≠ closing |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different body |
| `QTY_VARIANCE` / `PRICE_VARIANCE` / `TAX_VARIANCE` / `POSSIBLE_DUPLICATE` | 200 (hold) | Three-way match holds |

## Appendix B — Delivery roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| A (now → +6 weeks) | Decimal money, Mongo transactions on all multi-document postings, no in-place edits of posted vouchers, accounting periods with hard lock, transactional audit, D1, D2 | Trial balance equals the sum of voucher lines to the paisa; a back-dated post into a closed period fails; killing the process mid-delivery leaves no partial state |
| B (+6 → +14 weeks) | PostgreSQL ledger (§8.1 accounts/journals/periods/audit), dual-write shadow, nightly diff | Two consecutive closes with zero diff, then cut-over |
| C (+14 → +24 weeks) | Inventory ledger, FIFO/MAC, landed cost, lot/serial, stock positions with race-free allocation | Valuation report = INV GL accounts; load test: 500 concurrent orders on 1 unit → exactly 1 succeeds |
| D (+24 weeks →) | O2C/P2P documents with 3-way match, tax engine, bank feeds and matching, channel adapters, MRP | Per-module acceptance suites; external audit walkthrough |
