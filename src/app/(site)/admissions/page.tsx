"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Branch = { code: string; name: string };
type Course = { _id: string; code: string; title: string };
type ClassOption = { name: string; label: string; stage?: string; stream?: string };

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const blank = {
  applicantName: "",
  gender: "" as "" | "male" | "female" | "other",
  dateOfBirth: "",
  placeOfBirth: "",
  nationality: "Pakistani",
  religion: "Islam",
  bloodGroup: "",
  studentCnic: "",
  previousSchool: "",
  previousClass: "",
  lastResult: "",
  guardianName: "",
  guardianRelation: "father" as "father" | "mother" | "guardian" | "other",
  guardianCnic: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianOccupation: "",
  motherName: "",
  motherCnic: "",
  motherPhone: "",
  motherOccupation: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  province: "Punjab",
  postalCode: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  branchCode: "",
  academicYear: "",
  interest: "school" as "school" | "course",
  classApplied: "",
  courseId: "",
  transportRequired: false,
  medicalNotes: "",
  howHeard: "",
  message: "",
  declaration: false,
};

/** Formats digits as 12345-1234567-1 while typing. */
function formatCnic(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export default function AdmissionsPage() {
  return (
    <Suspense fallback={<section className="site-section">Loading form…</section>}>
      <AdmissionForm />
    </Suspense>
  );
}

function AdmissionForm() {
  const params = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [content, setContent] = useState({
    admissionsTitle: "Apply for admission",
    admissionsBody: "",
    tagline: "",
  });
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/site")
      .then((r) => r.json())
      .then((d) => {
        const list: Branch[] = d.branches || [];
        setBranches(list);
        setCourses(d.courses || []);
        setClassOptions(d.classOptions || []);
        if (d.content) setContent(d.content);
        const branchParam = params.get("branch");
        const courseParam = params.get("course");
        setForm((f) => ({
          ...f,
          branchCode: branchParam || list[0]?.code || "MAIN",
          courseId: courseParam || "",
          interest: courseParam ? "course" : "school",
          academicYear: d.academicYear || "",
        }));
      })
      .catch(() => setErr("Could not load the form. Please refresh."));
  }, [params]);

  function set<K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.declaration) {
      setErr("Please accept the declaration before submitting.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        gender: form.gender || undefined,
        courseId: form.courseId || null,
      };
      const res = await fetch("/api/site/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not submit application");
        return;
      }
      setDone(true);
      setForm({ ...blank, branchCode: form.branchCode, academicYear: form.academicYear });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <section className="site-section">
        <div className="site-card" style={{ maxWidth: 560 }}>
          <span className="site-tag">Application received</span>
          <h2>Thank you!</h2>
          <p>
            Your admission application has been submitted. Our office will contact you on the
            phone number you provided, usually within two working days.
          </p>
          <button type="button" className="site-btn" onClick={() => setDone(false)}>
            Submit another application
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="site-section">
      <span className="site-kicker">{content.tagline}</span>
      <h2>{content.admissionsTitle}</h2>
      <p className="site-lead">{content.admissionsBody}</p>
      {form.academicYear ? (
        <p className="site-session-note">Applying for session <b>{form.academicYear}</b></p>
      ) : null}

      <form className="site-form site-form-admission" onSubmit={onSubmit}>
        {err ? <div className="alert err">{err}</div> : null}

        <div className="site-form-section">
          <h3>1. Student details</h3>
          <div className="site-form-grid">
            <label>
              Full name (as on Form-B / CNIC) *
              <input
                value={form.applicantName}
                onChange={(e) => set("applicantName", e.target.value)}
                required
              />
            </label>
            <label>
              Gender *
              <select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as typeof form.gender)}
                required
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Date of birth *
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                required
              />
            </label>
            <label>
              Place of birth
              <input
                value={form.placeOfBirth}
                onChange={(e) => set("placeOfBirth", e.target.value)}
              />
            </label>
            <label>
              CNIC / Form-B
              <input
                value={form.studentCnic}
                onChange={(e) => set("studentCnic", formatCnic(e.target.value))}
                placeholder="12345-1234567-1"
                inputMode="numeric"
              />
            </label>
            <label>
              Nationality
              <input
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              />
            </label>
            <label>
              Religion
              <input value={form.religion} onChange={(e) => set("religion", e.target.value)} />
            </label>
            <label>
              Blood group
              <select
                value={form.bloodGroup}
                onChange={(e) => set("bloodGroup", e.target.value)}
              >
                <option value="">Select</option>
                {BLOOD.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="site-form-section">
          <h3>2. Previous education</h3>
          <div className="site-form-grid">
            <label>
              Previous school / college
              <input
                value={form.previousSchool}
                onChange={(e) => set("previousSchool", e.target.value)}
              />
            </label>
            <label>
              Last class / grade passed
              <input
                value={form.previousClass}
                onChange={(e) => set("previousClass", e.target.value)}
                placeholder="e.g. Class 5"
              />
            </label>
            <label>
              Last result / percentage
              <input
                value={form.lastResult}
                onChange={(e) => set("lastResult", e.target.value)}
                placeholder="e.g. 82% / A grade"
              />
            </label>
          </div>
        </div>

        <div className="site-form-section">
          <h3>3. Father / guardian</h3>
          <div className="site-form-grid">
            <label>
              Full name *
              <input
                value={form.guardianName}
                onChange={(e) => set("guardianName", e.target.value)}
                required
              />
            </label>
            <label>
              Relation *
              <select
                value={form.guardianRelation}
                onChange={(e) =>
                  set("guardianRelation", e.target.value as typeof form.guardianRelation)
                }
              >
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              CNIC *
              <input
                value={form.guardianCnic}
                onChange={(e) => set("guardianCnic", formatCnic(e.target.value))}
                placeholder="12345-1234567-1"
                inputMode="numeric"
                required
              />
            </label>
            <label>
              Occupation
              <input
                value={form.guardianOccupation}
                onChange={(e) => set("guardianOccupation", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                value={form.guardianPhone}
                onChange={(e) => set("guardianPhone", e.target.value)}
                placeholder="03XX-XXXXXXX"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.guardianEmail}
                onChange={(e) => set("guardianEmail", e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="site-form-section">
          <h3>4. Mother (optional)</h3>
          <div className="site-form-grid">
            <label>
              Full name
              <input
                value={form.motherName}
                onChange={(e) => set("motherName", e.target.value)}
              />
            </label>
            <label>
              CNIC
              <input
                value={form.motherCnic}
                onChange={(e) => set("motherCnic", formatCnic(e.target.value))}
                placeholder="12345-1234567-1"
                inputMode="numeric"
              />
            </label>
            <label>
              Phone
              <input
                value={form.motherPhone}
                onChange={(e) => set("motherPhone", e.target.value)}
              />
            </label>
            <label>
              Occupation
              <input
                value={form.motherOccupation}
                onChange={(e) => set("motherOccupation", e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="site-form-section">
          <h3>5. Contact & address</h3>
          <div className="site-form-grid">
            <label>
              Student / primary phone *
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="03XX-XXXXXXX"
                required
              />
            </label>
            <label>
              WhatsApp
              <input
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                placeholder="Same as phone if applicable"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </label>
            <label>
              City *
              <input value={form.city} onChange={(e) => set("city", e.target.value)} required />
            </label>
            <label>
              Province
              <select
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Postal code
              <input
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </label>
          </div>
          <label className="site-form-wide">
            Home address *
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="House / street, area, landmark"
              required
            />
          </label>
        </div>

        <div className="site-form-section">
          <h3>6. Emergency contact</h3>
          <div className="site-form-grid">
            <label>
              Name
              <input
                value={form.emergencyName}
                onChange={(e) => set("emergencyName", e.target.value)}
              />
            </label>
            <label>
              Relation
              <input
                value={form.emergencyRelation}
                onChange={(e) => set("emergencyRelation", e.target.value)}
                placeholder="Uncle / neighbour"
              />
            </label>
            <label>
              Phone
              <input
                value={form.emergencyPhone}
                onChange={(e) => set("emergencyPhone", e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="site-form-section">
          <h3>7. Admission preference</h3>
          <div className="site-form-grid">
            <label>
              Campus / branch *
              <select
                value={form.branchCode}
                onChange={(e) => set("branchCode", e.target.value)}
                required
              >
                {branches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Applying for *
              <select
                value={form.interest}
                onChange={(e) => set("interest", e.target.value as "school" | "course")}
              >
                <option value="school">School / college / university class</option>
                <option value="course">Online course / diploma</option>
              </select>
            </label>
            {form.interest === "school" ? (
              <label>
                Class / programme applied for *
                <select
                  value={form.classApplied}
                  onChange={(e) => set("classApplied", e.target.value)}
                  required={form.interest === "school"}
                >
                  <option value="">Select class</option>
                  {classOptions.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Course *
                <select
                  value={form.courseId}
                  onChange={(e) => set("courseId", e.target.value)}
                  required={form.interest === "course"}
                >
                  <option value="">Select a course</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              School transport needed?
              <select
                value={form.transportRequired ? "yes" : "no"}
                onChange={(e) => set("transportRequired", e.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label>
              How did you hear about us?
              <select
                value={form.howHeard}
                onChange={(e) => set("howHeard", e.target.value)}
              >
                <option value="">Select</option>
                <option value="Website">Website</option>
                <option value="Facebook">Facebook</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Friend / family">Friend / family</option>
                <option value="Banner / outdoor">Banner / outdoor</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>
          <label className="site-form-wide">
            Medical notes / allergies (if any)
            <textarea
              rows={2}
              value={form.medicalNotes}
              onChange={(e) => set("medicalNotes", e.target.value)}
            />
          </label>
          <label className="site-form-wide">
            Additional message
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
            />
          </label>
        </div>

        <label className="site-declare">
          <input
            type="checkbox"
            checked={form.declaration}
            onChange={(e) => set("declaration", e.target.checked)}
          />
          <span>
            I declare that the information provided is true and complete. I understand that false
            particulars may lead to cancellation of admission. *
          </span>
        </label>

        <button type="submit" className="site-btn" disabled={loading}>
          {loading ? "Submitting…" : "Submit admission application"}
        </button>
      </form>
    </section>
  );
}
