"use client";

import { PrintShell, QbLetterhead, chunk, fmtDate, usePrintData, useQr, type SchoolHeader } from "./PrintShell";

type Head = SchoolHeader & { email?: string; currency?: string; registrationNo?: string };

type Card = {
  _id: string;
  name: string;
  fatherName: string;
  classLabel: string;
  rollNumber: string;
  admissionNo: string;
  dateOfBirth: string | null;
  phone: string;
  address: string;
  photoUrl: string | null;
  head: Head;
};

type CardData = { principalName: string; session: string; validTill: string | null; cards: Card[] };

type StaffCard = {
  _id: string;
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  cnic: string;
  bloodGroup: string;
  phone: string;
  joinDate: string | null;
  photoUrl: string | null;
  head: Head;
};

type StaffCardData = { principalName: string; kind: "teacher" | "staff"; cards: StaffCard[] };

function Photo({ url, name }: { url: string | null; name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className="idc-photo">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </div>
  );
}

type CardRow = { label: string; value: string; className?: string };

/**
 * One credit-card-size ID card. Every value sits on its own line and is cut short with "…"
 * rather than running into the photo, the QR code or the footer.
 */
function IdCardView({
  head,
  band,
  name,
  photoUrl,
  rows,
  qrText,
  validity,
}: {
  head: Head;
  band: string;
  name: string;
  photoUrl: string | null;
  rows: CardRow[];
  qrText: string;
  validity: string;
}) {
  const qr = useQr(qrText);
  const returnTo = [head.address, head.phone].filter(Boolean).join(" · ") || head.name;
  return (
    <article className="idc">
      <header className="idc-top">
        {head.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={head.logoUrl} alt="" />
        ) : null}
        <div>
          <b>{head.name}</b>
          <span>{head.campus || head.address}</span>
        </div>
      </header>
      <div className="idc-band">{band}</div>
      <div className="idc-body">
        <Photo url={photoUrl} name={name} />
        <div className="idc-info">
          <div className="idc-name" title={name}>{name}</div>
          <dl>
            {rows.map((r) => (
              <div key={r.label} className="idc-row">
                <dt>{r.label}</dt>
                <dd className={r.className} title={r.value}>{r.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="idc-qr">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="" />
          ) : null}
          <div className="idc-sign">
            <i />
            Principal
          </div>
        </div>
      </div>
      <footer className="idc-foot">
        <span>{validity}</span>
        <span title={returnTo}>If found, return to: {returnTo}</span>
      </footer>
    </article>
  );
}

function IdCard({ c, data }: { c: Card; data: CardData }) {
  return (
    <IdCardView
      head={c.head}
      band={`STUDENT IDENTITY CARD${data.session ? ` · ${data.session}` : ""}`}
      name={c.name}
      photoUrl={c.photoUrl}
      rows={[
        { label: "Father", value: c.fatherName },
        { label: "Class", value: `${c.classLabel}${c.rollNumber ? ` · Roll ${c.rollNumber}` : ""}` },
        { label: "Adm No", value: c.admissionNo, className: "idc-code" },
        ...(c.dateOfBirth ? [{ label: "DOB", value: fmtDate(c.dateOfBirth) }] : []),
        { label: "Phone", value: c.phone },
      ]}
      qrText={[c.name, `Adm No: ${c.admissionNo}`, `Class: ${c.classLabel}`, c.fatherName && `Father: ${c.fatherName}`, c.phone && `Emergency: ${c.phone}`, c.head.name]
        .filter(Boolean)
        .join("\n")}
      validity={data.validTill ? `Valid till ${fmtDate(data.validTill)}` : "Valid for the current session"}
    />
  );
}

/** ID cards, 10 per A4 page (credit-card size, cut along the lines). */
export function IdCardsPrint({ classIds, ids }: { classIds: string; ids: string }) {
  const qs = new URLSearchParams({ ...(classIds ? { classIds } : {}), ...(ids ? { ids } : {}) }).toString();
  const { data, error } = usePrintData<CardData>(qs ? `/api/students/id-cards?${qs}` : null);
  const empty = data && !data.cards.length ? "No active students in this selection" : "";
  return (
    <PrintShell
      title="Student ID Cards"
      info={data ? `${data.cards.length} cards · ${Math.ceil(data.cards.length / 10)} page(s) · cut along the lines` : undefined}
      error={error || empty || (!qs ? "Pick a class first" : "")}
      loading={!data}
    >
      {data
        ? chunk(data.cards, 10).map((page, i) => (
            <section key={i} className="doc-page idc-page">
              {page.map((c) => <IdCard key={c._id} c={c} data={data} />)}
            </section>
          ))
        : null}
    </PrintShell>
  );
}

/** Teacher or campus-staff ID cards, same size and layout as the student cards. */
export function StaffIdCardsPrint({ kind, ids }: { kind: "teacher" | "staff"; ids: string }) {
  const qs = new URLSearchParams({ kind, ...(ids ? { ids } : {}) }).toString();
  const { data, error } = usePrintData<StaffCardData>(`/api/staff/id-cards?${qs}`);
  const who = kind === "teacher" ? "teachers" : "staff";
  const empty = data && !data.cards.length ? `No active ${who} to print` : "";
  return (
    <PrintShell
      title={kind === "teacher" ? "Teacher ID Cards" : "Staff ID Cards"}
      info={data ? `${data.cards.length} cards · ${Math.ceil(data.cards.length / 10)} page(s) · cut along the lines` : undefined}
      error={error || empty}
      loading={!data}
    >
      {data
        ? chunk(data.cards, 10).map((page, i) => (
            <section key={i} className="doc-page idc-page">
              {page.map((c) => (
                <IdCardView
                  key={c._id}
                  head={c.head}
                  band={kind === "teacher" ? "TEACHER IDENTITY CARD" : "STAFF IDENTITY CARD"}
                  name={c.name}
                  photoUrl={c.photoUrl}
                  rows={[
                    { label: "Post", value: `${c.designation}${c.department ? ` · ${c.department}` : ""}` },
                    { label: "Emp ID", value: c.employeeId, className: "idc-code" },
                    ...(c.cnic ? [{ label: "CNIC", value: c.cnic, className: "idc-code" }] : []),
                    ...(c.bloodGroup ? [{ label: "Blood", value: c.bloodGroup }] : []),
                    { label: "Phone", value: c.phone },
                  ]}
                  qrText={[c.name, `Employee ID: ${c.employeeId}`, c.designation, c.phone && `Phone: ${c.phone}`, c.head.name].filter(Boolean).join("\n")}
                  validity={c.joinDate ? `Joined ${fmtDate(c.joinDate)}` : "Employee card"}
                />
              ))}
            </section>
          ))
        : null}
    </PrintShell>
  );
}

type Cert = {
  type: "admission" | "leaving" | "character" | "studying" | "clearance";
  title: string;
  head: Head;
  principalName: string;
  session: string;
  refNo: string;
  issueDate: string | null;
  dues: { amount: number; months: number };
  student: {
    _id: string;
    name: string;
    gender: string;
    fatherName: string;
    admissionNo: string;
    rollNumber: string;
    classLabel: string;
    classTeacher: string;
    dateOfBirth: string | null;
    admissionDate: string | null;
    cnic: string;
    nationality: string;
    religion: string;
    address: string;
    phone: string;
    email: string;
    parentPhone: string;
    parentEmail: string;
    previousSchool: string;
    status: string;
    leavingDate: string | null;
    leavingReason: string;
    conduct: string;
    photoUrl: string | null;
  };
};

/** "14 August 2016 (Fourteenth August, Two Thousand Sixteen)" is overkill; schools write the date plainly. */
const longDate = (v: string | null) =>
  v ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—";

function words(gender: string) {
  if (gender === "male") return { child: "son", he: "He", his: "his", him: "him" };
  if (gender === "female") return { child: "daughter", he: "She", his: "her", him: "her" };
  return { child: "son/daughter", he: "He/She", his: "his/her", him: "him/her" };
}

function Fields({ rows }: { rows: [string, string | undefined | null][] }) {
  return (
    <dl className="cert-fields">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function CertBody({ d }: { d: Cert }) {
  const s = d.student;
  const w = words(s.gender);
  const cur = d.head.currency || "PKR";
  const who = (
    <>
      <b>{s.name}</b> {w.child} of <b>{s.fatherName || "—"}</b>, Admission No. <b>{s.admissionNo}</b>
    </>
  );
  switch (d.type) {
    case "admission":
      return (
        <>
          <h3 className="cert-sec">Student</h3>
          <Fields
            rows={[
              ["Full name", s.name],
              ["Admission no.", s.admissionNo],
              ["Class", s.classLabel],
              ["Roll no.", s.rollNumber],
              ["Date of birth", longDate(s.dateOfBirth)],
              ["Gender", s.gender ? s.gender[0].toUpperCase() + s.gender.slice(1) : ""],
              ["B-Form / CNIC", s.cnic],
              ["Nationality", s.nationality],
              ["Religion", s.religion],
              ["Previous school", s.previousSchool],
              ["Admission date", longDate(s.admissionDate)],
              ["Student phone", s.phone],
            ]}
          />
          <h3 className="cert-sec">Parent / guardian</h3>
          <Fields
            rows={[
              ["Father / guardian", s.fatherName],
              ["Phone (WhatsApp)", s.parentPhone],
              ["Email", s.parentEmail],
              ["Address", s.address],
            ]}
          />
          <p className="cert-note">
            I confirm the information above is correct and agree to follow the rules of the school and to pay the fee by the
            due date.
          </p>
        </>
      );
    case "leaving":
      return (
        <>
          <p className="cert-text">
            Certified that {who}, was a student of this school from <b>{longDate(s.admissionDate)}</b> to{" "}
            <b>{longDate(s.leavingDate)}</b>. {w.he} last studied in class <b>{s.classLabel}</b>.
          </p>
          <Fields
            rows={[
              ["Date of birth", longDate(s.dateOfBirth)],
              ["B-Form / CNIC", s.cnic],
              ["Class last attended", s.classLabel],
              ["Date of leaving", longDate(s.leavingDate)],
              ["Reason for leaving", s.leavingReason],
              ["Conduct", s.conduct],
              ["School dues", d.dues.amount ? `${cur} ${d.dues.amount.toLocaleString("en-PK")} outstanding` : "All dues cleared"],
            ]}
          />
          <p className="cert-text">We wish {w.him} every success in the future.</p>
        </>
      );
    case "character":
      return (
        <p className="cert-text">
          This is to certify that {who}, {s.status === "active" ? "is a bonafide student" : "remained a student"} of this
          school in class <b>{s.classLabel}</b>. To the best of our knowledge {w.he.toLowerCase()} bears a{" "}
          <b>{(s.conduct || "good").toLowerCase()}</b> moral character. {w.he} has not taken part in any activity against the
          discipline of the school. We wish {w.him} success in life.
        </p>
      );
    case "studying":
      return (
        <>
          <p className="cert-text">
            This is to certify that {who}, is a regular student of this school, studying in class <b>{s.classLabel}</b>
            {d.session ? <> in the academic session <b>{d.session}</b></> : null}.
          </p>
          <p className="cert-text">
            According to the school record {w.his} date of birth is <b>{longDate(s.dateOfBirth)}</b>. This certificate is issued
            on the request of the parent for whatever purpose it may serve.
          </p>
        </>
      );
    case "clearance":
      return (
        <p className="cert-text">
          This is to certify that {who}, class <b>{s.classLabel}</b>, has paid all fee and other dues of this school up to
          the date of issue. Nothing is outstanding against {w.his} name.
        </p>
      );
  }
}

/** One certificate for one student, on the campus letterhead. */
export function CertificatePrint({ studentId, type }: { studentId: string; type: string }) {
  const { data: d, error } = usePrintData<Cert>(studentId ? `/api/students/${studentId}/certificate?type=${encodeURIComponent(type)}` : null);
  const cur = d?.head.currency || "PKR";
  const blocked =
    d?.type === "clearance" && d.dues.amount > 0
      ? `Not cleared: ${cur} ${d.dues.amount.toLocaleString("en-PK")} unpaid on ${d.dues.months} challan(s). Collect the fee first.`
      : "";
  return (
    <PrintShell title={d ? `${d.title} — ${d.student.name}` : "Certificate"} error={error || blocked} loading={!d}>
      {d && !blocked ? (
        <section className={`doc-page cert cert-${d.type}`}>
          <div className="cert-frame">
            <QbLetterhead school={d.head} extra={d.head.registrationNo ? `Reg. No. ${d.head.registrationNo}` : undefined} />
            <div className="cert-ref">
              <span>Ref: {d.refNo}</span>
              <span>Date: {longDate(d.issueDate)}</span>
            </div>
            <div className="cert-title-row">
              <h2 className="cert-title">{d.title}</h2>
              {d.type !== "clearance" ? (
                <div className="cert-photo">
                  {d.student.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.student.photoUrl} alt="" />
                  ) : (
                    <span>Photo</span>
                  )}
                </div>
              ) : null}
            </div>
            <CertBody d={d} />
            <div className="cert-signs">
              {d.type === "admission" ? (
                <span>Parent / guardian</span>
              ) : (
                <span>
                  {d.student.classTeacher || "Class teacher"}
                  {d.student.classTeacher ? <small>Class teacher</small> : null}
                </span>
              )}
              {d.type === "clearance" ? <span>Accounts office</span> : null}
              <span>
                {d.principalName || "Principal"}
                <small>{d.principalName ? "Principal · stamp" : "Signature & stamp"}</small>
              </span>
            </div>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
