"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { formatNumber, prettyDate, toDateInput } from "@/lib/types";

type ModuleKey =
  | "timetable"
  | "library"
  | "transport"
  | "hostel"
  | "medical"
  | "cafeteria"
  | "assets"
  | "documents"
  | "ai";

type ModuleConfig = {
  key: ModuleKey;
  code: string;
  label: string;
  hint: string;
  register: string;
  primary: { label: string; modal: string };
  secondary?: { label: string; modal: string };
};

/** One card per campus module — same launcher pattern as the stock vouchers. */
const MODULES: ModuleConfig[] = [
  {
    key: "timetable",
    code: "TT",
    label: "Timetable",
    hint: "Periods, rooms & conflict checks",
    register: "Period Allocation Register",
    primary: { label: "Add Slot", modal: "timetable" },
  },
  {
    key: "library",
    code: "LIB",
    label: "Library",
    hint: "Catalogue, issue & returns",
    register: "Library Catalogue",
    primary: { label: "Add Book", modal: "book" },
    secondary: { label: "Issue Book", modal: "issue" },
  },
  {
    key: "transport",
    code: "TRP",
    label: "Transport",
    hint: "Vehicles, routes & drivers",
    register: "Fleet Register",
    primary: { label: "Add Vehicle", modal: "vehicle" },
  },
  {
    key: "hostel",
    code: "HTL",
    label: "Hostel",
    hint: "Rooms, beds & allocations",
    register: "Room Register",
    primary: { label: "Add Room", modal: "room" },
    secondary: { label: "Allocate Bed", modal: "allocate" },
  },
  {
    key: "medical",
    code: "MED",
    label: "Medical",
    hint: "Clinic visits & prescriptions",
    register: "Clinic Visit Log",
    primary: { label: "Log Visit", modal: "visit" },
  },
  {
    key: "cafeteria",
    code: "POS",
    label: "Cafeteria",
    hint: "Menu items & counter sales",
    register: "Menu & Sales",
    primary: { label: "Add Item", modal: "cafe-item" },
    secondary: { label: "Record Sale", modal: "cafe-sale" },
  },
  {
    key: "assets",
    code: "AST",
    label: "Assets",
    hint: "Tagging, location & upkeep",
    register: "Asset Register",
    primary: { label: "Register Asset", modal: "asset" },
  },
  {
    key: "documents",
    code: "DOC",
    label: "Documents",
    hint: "Files with version history",
    register: "Document Vault",
    primary: { label: "Add Document", modal: "document" },
  },
  {
    key: "ai",
    code: "AI",
    label: "AI Layer",
    hint: "Assistants & generated drafts",
    register: "AI Job History",
    primary: { label: "Run AI Job", modal: "ai" },
  },
];

const MODAL_TITLES: Record<string, string> = {
  timetable: "New Timetable Slot",
  book: "Add Book to Catalogue",
  issue: "Issue Book",
  vehicle: "Register Vehicle",
  room: "Add Hostel Room",
  allocate: "Allocate Bed",
  visit: "Log Clinic Visit",
  "cafe-item": "Add Menu Item",
  "cafe-sale": "Record Counter Sale",
  asset: "Register Asset",
  document: "Add Document",
  ai: "Run AI Job",
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type Ref = { _id: string; name?: string; section?: string; firstName?: string; lastName?: string };

type Slot = {
  _id: string;
  day: string;
  period: number;
  startTime?: string;
  endTime?: string;
  room?: string;
  kind: string;
  classId?: Ref;
  subjectId?: Ref;
  teacherId?: Ref;
};

type Book = {
  _id: string;
  title: string;
  author?: string;
  isbn?: string;
  category?: string;
  copies: number;
  available: number;
  location?: string;
  status: string;
};

type Loan = {
  _id: string;
  bookId?: { _id: string; title: string };
  borrowerName: string;
  borrowerType: string;
  issuedAt: string;
  dueAt: string;
  fine: number;
  status: string;
};

type Vehicle = {
  _id: string;
  code: string;
  plateNo: string;
  type: string;
  capacity: number;
  driverName?: string;
  driverPhone?: string;
  routeName?: string;
  stops: string[];
  gpsReady: boolean;
  status: string;
};

type Room = {
  _id: string;
  hostelName: string;
  building?: string;
  floor?: string;
  roomNo: string;
  beds: number;
  occupied: number;
  gender: string;
  monthlyFee: number;
  status: string;
};

type Allocation = {
  _id: string;
  roomId?: { _id: string; hostelName: string; roomNo: string };
  studentName: string;
  bedNo?: number;
  fromDate: string;
  status: string;
};

type Visit = {
  _id: string;
  personType: string;
  personName: string;
  visitDate: string;
  complaint: string;
  diagnosis?: string;
  prescription?: string;
  doctor?: string;
  severity: string;
};

type MenuItem = {
  _id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
};

type Sale = {
  _id: string;
  number: string;
  buyerName?: string;
  buyerType: string;
  items: { name: string; qty: number; amount: number }[];
  total: number;
  paid: number;
  saleDate: string;
};

type AssetRow = {
  _id: string;
  tag: string;
  name: string;
  category: string;
  location?: string;
  assignedTo?: string;
  purchaseCost: number;
  vendor?: string;
  status: string;
};

type DocRow = {
  _id: string;
  title: string;
  category: string;
  ownerType: string;
  ownerName?: string;
  fileUrl?: string;
  version: number;
  updatedAt: string;
};

type AiJobRow = {
  _id: string;
  kind: string;
  prompt: string;
  provider: string;
  status: string;
  result?: string;
  createdAt: string;
};

type Stat = { tag: string; value: string };

export default function CampusOpsPage() {
  const [active, setActive] = useState<ModuleKey>("timetable");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState("timetable");
  const [form, setForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [jobs, setJobs] = useState<AiJobRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [classes, setClasses] = useState<Ref[]>([]);
  const [teachers, setTeachers] = useState<Ref[]>([]);
  const [subjects, setSubjects] = useState<Ref[]>([]);
  const [directory, setDirectory] = useState<{
    students: { _id: string; code: string; name: string; label: string }[];
    teachers: { _id: string; code: string; name: string; label: string }[];
    staff: { _id: string; code: string; name: string; label: string }[];
  }>({ students: [], teachers: [], staff: [] });

  const config = MODULES.find((m) => m.key === active) as ModuleConfig;

  const loadLookups = useCallback(async () => {
    const [c, t, s, dir] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/campus?view=directory").then((r) => r.json()),
    ]);
    setClasses(c.classes || []);
    setTeachers(t.teachers || []);
    setSubjects(s.subjects || []);
    setDirectory({
      students: dir.students || [],
      teachers: dir.teachers || [],
      staff: dir.staff || [],
    });
  }, []);

  const loadCounts = useCallback(async () => {
    const d = await fetch("/api/campus").then((r) => r.json());
    const s = d.stats || {};
    setCounts({
      timetable: s.slots || 0,
      library: s.books || 0,
      transport: s.vehicles || 0,
      hostel: s.rooms || 0,
      medical: s.visits || 0,
      cafeteria: s.cafeItems || 0,
      assets: s.assets || 0,
      documents: s.docs || 0,
      ai: s.aiJobs || 0,
    });
  }, []);

  const load = useCallback(async () => {
    setErr("");
    const d = await fetch(`/api/campus?view=${active}`).then((r) => r.json());
    if (d.error) {
      setErr(d.error);
      return;
    }
    if (active === "timetable") setSlots(d.slots || []);
    if (active === "library") {
      setBooks(d.books || []);
      setLoans(d.loans || []);
    }
    if (active === "transport") setVehicles(d.vehicles || []);
    if (active === "hostel") {
      setRooms(d.rooms || []);
      setAllocations(d.allocations || []);
    }
    if (active === "medical") setVisits(d.visits || []);
    if (active === "cafeteria") {
      setMenu(d.items || []);
      setSales(d.sales || []);
    }
    if (active === "assets") setAssets(d.assets || []);
    if (active === "documents") setDocuments(d.documents || []);
    if (active === "ai") setJobs(d.jobs || []);
  }, [active]);

  useEffect(() => {
    loadLookups();
    loadCounts();
  }, [loadLookups, loadCounts]);

  useEffect(() => {
    setSearch("");
    load();
  }, [load]);

  function openModal(modalKey: string) {
    setModal(modalKey);
    setForm(
      modalKey === "timetable"
        ? { day: "mon", period: "1", slotKind: "class" }
        : modalKey === "issue"
          ? { days: "14", borrowerType: "student" }
          : modalKey === "visit"
            ? { visitDate: toDateInput(new Date()), severity: "normal", personType: "student" }
            : modalKey === "ai"
              ? { aiKind: "insight" }
              : modalKey === "cafe-sale"
                ? { qty: "1", buyerType: "student" }
                : {}
    );
    setErr("");
    setOpen(true);
  }

  async function post(body: Record<string, unknown>) {
    setErr("");
    setMsg("");
    const res = await fetch("/api/campus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Request failed");
      return false;
    }
    setOpen(false);
    setMsg("Saved successfully.");
    await Promise.all([load(), loadCounts()]);
    return true;
  }

  async function remove(id: string, kind: string) {
    if (!confirm("Delete this record permanently?")) return;
    const res = await fetch(`/api/campus/${id}?kind=${kind}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not delete");
      return;
    }
    await Promise.all([load(), loadCounts()]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payloads: Record<string, Record<string, unknown>> = {
      timetable: {
        module: "timetable",
        day: form.day || "mon",
        period: Number(form.period || 1),
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        classId: form.classId || undefined,
        subjectId: form.subjectId || undefined,
        teacherId: form.teacherId || undefined,
        room: form.room || undefined,
        kind: form.slotKind || "class",
      },
      book: {
        module: "book",
        title: form.title,
        author: form.author,
        isbn: form.isbn,
        category: form.category || "General",
        copies: Number(form.copies || 1),
        location: form.location,
      },
      issue: {
        module: "issue",
        bookId: form.bookId,
        borrowerId: form.borrowerId,
        borrowerType: form.borrowerType || "student",
        days: Number(form.days || 14),
      },
      vehicle: {
        module: "vehicle",
        code: form.code || undefined,
        plateNo: form.plateNo,
        type: form.type || "bus",
        capacity: Number(form.capacity || 30),
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        driverStaffId: form.driverStaffId || undefined,
        routeName: form.routeName,
        stops: form.stops
          ? form.stops.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        gpsReady: form.gpsReady === "yes",
      },
      room: {
        module: "room",
        hostelName: form.hostelName,
        building: form.building,
        roomNo: form.roomNo,
        beds: Number(form.beds || 2),
        gender: form.gender || "any",
        monthlyFee: Number(form.monthlyFee || 0),
      },
      allocate: {
        module: "allocate",
        roomId: form.roomId,
        studentId: form.studentId,
        bedNo: form.bedNo ? Number(form.bedNo) : undefined,
      },
      visit: {
        module: "visit",
        personType: form.personType || "student",
        personId: form.personId,
        visitDate: form.visitDate,
        complaint: form.complaint,
        diagnosis: form.diagnosis,
        prescription: form.prescription,
        doctor: form.doctor,
        severity: form.severity || "normal",
      },
      "cafe-item": {
        module: "cafe-item",
        sku: form.sku,
        name: form.name,
        category: form.category || "Food",
        price: Number(form.price || 0),
        stock: Number(form.stock || 0),
      },
      "cafe-sale": {
        module: "cafe-sale",
        buyerName: form.buyerType === "guest" ? form.buyerName : undefined,
        buyerType: form.buyerType || "student",
        buyerId: form.buyerType === "guest" ? undefined : form.buyerId,
        lines: [{ itemId: form.itemId, qty: Number(form.qty || 1) }],
      },
      asset: {
        module: "asset",
        tag: form.tag || undefined,
        name: form.name,
        category: form.category || "Equipment",
        location: form.location,
        assignedPersonType: form.assignedPersonType || "staff",
        assignedPersonId: form.assignedPersonId || undefined,
        purchaseCost: Number(form.purchaseCost || 0),
        vendor: form.vendor,
        status: form.status || "in_use",
      },
      document: {
        module: "document",
        title: form.title,
        category: form.category || "General",
        ownerType: form.ownerType || "student",
        ownerId: form.ownerId || undefined,
        ownerName: form.ownerName,
        fileUrl: form.fileUrl,
      },
      ai: {
        module: "ai",
        aiKind: form.aiKind || "insight",
        prompt: form.prompt,
      },
    };
    const body = payloads[modal];
    if (body) await post(body);
  }

  /** Three headline numbers for whichever module is open. */
  const stats: Stat[] = useMemo(() => {
    if (active === "timetable") {
      return [
        { tag: "Allocated Periods", value: String(slots.length) },
        { tag: "Days Covered", value: String(new Set(slots.map((s) => s.day)).size) },
        {
          tag: "Rooms In Use",
          value: String(new Set(slots.map((s) => s.room).filter(Boolean)).size),
        },
      ];
    }
    if (active === "library") {
      return [
        { tag: "Titles", value: String(books.length) },
        {
          tag: "Copies Available",
          value: String(books.reduce((sum, b) => sum + b.available, 0)),
        },
        {
          tag: "Books On Loan",
          value: String(loans.filter((l) => l.status !== "returned").length),
        },
      ];
    }
    if (active === "transport") {
      return [
        { tag: "Vehicles", value: String(vehicles.length) },
        {
          tag: "Total Seats",
          value: String(vehicles.reduce((sum, v) => sum + v.capacity, 0)),
        },
        {
          tag: "Active Routes",
          value: String(new Set(vehicles.map((v) => v.routeName).filter(Boolean)).size),
        },
      ];
    }
    if (active === "hostel") {
      const beds = rooms.reduce((sum, r) => sum + r.beds, 0);
      const filled = rooms.reduce((sum, r) => sum + r.occupied, 0);
      return [
        { tag: "Rooms", value: String(rooms.length) },
        { tag: "Beds Occupied", value: `${filled} / ${beds}` },
        {
          tag: "Occupancy",
          value: beds ? `${Math.round((filled / beds) * 100)}%` : "0%",
        },
      ];
    }
    if (active === "medical") {
      return [
        { tag: "Clinic Visits", value: String(visits.length) },
        {
          tag: "Urgent / Emergency",
          value: String(visits.filter((v) => v.severity !== "normal").length),
        },
        {
          tag: "Students Treated",
          value: String(visits.filter((v) => v.personType === "student").length),
        },
      ];
    }
    if (active === "cafeteria") {
      return [
        { tag: "Menu Items", value: String(menu.length) },
        { tag: "Sales Recorded", value: String(sales.length) },
        {
          tag: "Sales Value",
          value: `PKR ${formatNumber(sales.reduce((sum, s) => sum + s.total, 0))}`,
        },
      ];
    }
    if (active === "assets") {
      return [
        { tag: "Tagged Assets", value: String(assets.length) },
        {
          tag: "Book Value",
          value: `PKR ${formatNumber(assets.reduce((sum, a) => sum + a.purchaseCost, 0))}`,
        },
        {
          tag: "Under Repair",
          value: String(assets.filter((a) => a.status === "repair").length),
        },
      ];
    }
    if (active === "documents") {
      return [
        { tag: "Documents", value: String(documents.length) },
        {
          tag: "Total Versions",
          value: String(documents.reduce((sum, d) => sum + d.version, 0)),
        },
        {
          tag: "Categories",
          value: String(new Set(documents.map((d) => d.category)).size),
        },
      ];
    }
    return [
      { tag: "AI Jobs", value: String(jobs.length) },
      {
        tag: "Completed",
        value: String(jobs.filter((j) => j.status === "done").length),
      },
      { tag: "Provider", value: jobs[0]?.provider || "stub" },
    ];
  }, [active, slots, books, loans, vehicles, rooms, visits, menu, sales, assets, documents, jobs]);

  const term = search.trim().toLowerCase();
  const match = (...fields: (string | undefined)[]) =>
    !term || fields.some((f) => (f || "").toLowerCase().includes(term));

  const shownSlots = slots.filter((s) =>
    match(s.room, s.classId?.name, s.subjectId?.name, s.teacherId?.firstName)
  );
  const shownBooks = books.filter((b) => match(b.title, b.author, b.isbn, b.category));
  const shownVehicles = vehicles.filter((v) =>
    match(v.code, v.plateNo, v.routeName, v.driverName)
  );
  const shownRooms = rooms.filter((r) => match(r.hostelName, r.roomNo, r.building));
  const shownVisits = visits.filter((v) => match(v.personName, v.complaint, v.doctor));
  const shownMenu = menu.filter((m) => match(m.sku, m.name, m.category));
  const shownAssets = assets.filter((a) => match(a.tag, a.name, a.category, a.location));
  const shownDocs = documents.filter((d) => match(d.title, d.category, d.ownerName));

  return (
    <>
      <Hero
        title="Campus Operations"
        subtitle="Facilities, services and support modules across the institution"
        live={config.label}
        actionLabel={config.primary.label}
        onAction={() => openModal(config.primary.modal)}
      />

      <div className="pay-stat-row">
        {stats.map((s) => (
          <div className="pay-stat" key={s.tag}>
            <div className="tag">{s.tag}</div>
            <div className="num">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="voucher-launch-grid no-print">
        {MODULES.map((m) => (
          <button
            type="button"
            key={m.key}
            className={`voucher-launch${active === m.key ? " active" : ""}`}
            onClick={() => {
              setActive(m.key);
              setMsg("");
            }}
          >
            <span>{m.code}</span>
            <strong>{m.label}</strong>
            <small>{m.hint}</small>
            <div className="count">{counts[m.key] ?? 0} records</div>
          </button>
        ))}
      </div>

      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <div className="accounting-toolbar no-print">
        <div className="chips">
          <button
            type="button"
            className="btn-dark"
            onClick={() => openModal(config.primary.modal)}
          >
            {config.primary.label}
          </button>
          {config.secondary ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => openModal(config.secondary!.modal)}
            >
              {config.secondary.label}
            </button>
          ) : null}
        </div>
        <input
          className={inputClass}
          placeholder={`Search ${config.label.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {active === "timetable" ? (
        <Panel title={config.register} meta={`${shownSlots.length} PERIODS`}>
          {!shownSlots.length ? (
            <EmptyState message="No periods allocated yet. Add a slot — clashes on class, teacher or room are blocked automatically." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="right">Period</th>
                    <th>Class</th>
                    <th>Subject / Teacher</th>
                    <th>Room</th>
                    <th className="right">Type</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownSlots.map((s) => (
                    <tr key={s._id}>
                      <td className="num">{s.day.toUpperCase()}</td>
                      <td className="num">{s.period}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {s.classId?.name || "—"}
                          {s.classId?.section ? `-${s.classId.section}` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "Timing not set"}
                        </div>
                      </td>
                      <td>
                        <div>{s.subjectId?.name || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {s.teacherId
                            ? `${s.teacherId.firstName} ${s.teacherId.lastName}`
                            : "Teacher unassigned"}
                        </div>
                      </td>
                      <td>{s.room || "—"}</td>
                      <td className="right">
                        <StatusBadge status={s.kind === "class" ? "active" : s.kind} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => remove(s._id, "timetable")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {active === "library" ? (
        <>
          <Panel title="Library Catalogue" meta={`${shownBooks.length} TITLES`}>
            {!shownBooks.length ? (
              <EmptyState message="Catalogue is empty. Add a book to start issuing." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Title / Author</th>
                      <th>ISBN</th>
                      <th>Category</th>
                      <th className="right">Available</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownBooks.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{b.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {b.author || "Author unknown"}
                            {b.location ? ` · ${b.location}` : ""}
                          </div>
                        </td>
                        <td className="num">{b.isbn || "—"}</td>
                        <td>{b.category || "General"}</td>
                        <td className="num">
                          {b.available} / {b.copies}
                        </td>
                        <td className="right">
                          <StatusBadge status={b.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => {
                                setModal("issue");
                                setForm({
                                  bookId: b._id,
                                  days: "14",
                                  borrowerType: "student",
                                });
                                setErr("");
                                setOpen(true);
                              }}
                            >
                              Issue
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => remove(b._id, "book")}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Issue & Return Register" meta={`${loans.length} MOVEMENTS`}>
            {!loans.length ? (
              <EmptyState message="No books issued yet." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Borrower</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th className="right">Fine</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l) => (
                      <tr key={l._id}>
                        <td>{l.bookId?.title || "—"}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{l.borrowerName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {l.borrowerType}
                          </div>
                        </td>
                        <td>{prettyDate(l.issuedAt)}</td>
                        <td>{prettyDate(l.dueAt)}</td>
                        <td className="num">{formatNumber(l.fine || 0)}</td>
                        <td className="right">
                          <StatusBadge status={l.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            {l.status === "returned" ? (
                              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                Closed
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() =>
                                  post({ module: "return", loanId: l._id, fine: 0 })
                                }
                              >
                                Return
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {active === "transport" ? (
        <Panel title={config.register} meta={`${shownVehicles.length} VEHICLES`}>
          {!shownVehicles.length ? (
            <EmptyState message="No vehicles registered. Add a bus or van to build routes." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Vehicle</th>
                    <th>Route / Stops</th>
                    <th>Driver</th>
                    <th className="right">Capacity</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownVehicles.map((v) => (
                    <tr key={v._id}>
                      <td className="num">{v.code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{v.plateNo}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {v.type}
                          {v.gpsReady ? " · GPS ready" : ""}
                        </div>
                      </td>
                      <td>
                        <div>{v.routeName || "Route not set"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {v.stops?.length ? v.stops.join(" → ") : "No stops"}
                        </div>
                      </td>
                      <td>
                        <div>{v.driverName || "—"}</div>
                        <div className="num" style={{ fontSize: 10 }}>
                          {v.driverPhone || ""}
                        </div>
                      </td>
                      <td className="num">{v.capacity}</td>
                      <td className="right">
                        <StatusBadge status={v.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => remove(v._id, "vehicle")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {active === "hostel" ? (
        <>
          <Panel title={config.register} meta={`${shownRooms.length} ROOMS`}>
            {!shownRooms.length ? (
              <EmptyState message="No hostel rooms yet. Add rooms before allocating beds." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Hostel</th>
                      <th>Room</th>
                      <th>Gender</th>
                      <th className="right">Beds</th>
                      <th className="right">Monthly Fee</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRooms.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.hostelName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {r.building || "Main building"}
                          </div>
                        </td>
                        <td className="num">{r.roomNo}</td>
                        <td>{r.gender}</td>
                        <td className="num">
                          {r.occupied} / {r.beds}
                        </td>
                        <td className="num">{formatNumber(r.monthlyFee)}</td>
                        <td className="right">
                          <StatusBadge status={r.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => {
                                setModal("allocate");
                                setForm({ roomId: r._id });
                                setErr("");
                                setOpen(true);
                              }}
                            >
                              Allocate
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => remove(r._id, "room")}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Current Residents" meta={`${allocations.length} ACTIVE`}>
            {!allocations.length ? (
              <EmptyState message="No active bed allocations." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Resident</th>
                      <th>Hostel / Room</th>
                      <th className="right">Bed</th>
                      <th>Since</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a._id}>
                        <td style={{ fontWeight: 600 }}>{a.studentName}</td>
                        <td>
                          {a.roomId?.hostelName} · {a.roomId?.roomNo}
                        </td>
                        <td className="num">{a.bedNo ?? "—"}</td>
                        <td>{prettyDate(a.fromDate)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() =>
                                post({ module: "vacate", allocationId: a._id })
                              }
                            >
                              Vacate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {active === "medical" ? (
        <Panel title={config.register} meta={`${shownVisits.length} VISITS`}>
          {!shownVisits.length ? (
            <EmptyState message="No clinic visits recorded." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Complaint / Diagnosis</th>
                    <th>Prescription</th>
                    <th>Doctor</th>
                    <th className="right">Severity</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownVisits.map((v) => (
                    <tr key={v._id}>
                      <td>{prettyDate(v.visitDate)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{v.personName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {v.personType}
                        </div>
                      </td>
                      <td>
                        <div>{v.complaint}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {v.diagnosis || "No diagnosis recorded"}
                        </div>
                      </td>
                      <td>{v.prescription || "—"}</td>
                      <td>{v.doctor || "—"}</td>
                      <td className="right">
                        <StatusBadge status={v.severity} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => remove(v._id, "visit")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {active === "cafeteria" ? (
        <>
          <Panel title="Menu" meta={`${shownMenu.length} ITEMS`}>
            {!shownMenu.length ? (
              <EmptyState message="No menu items yet. Add items before recording sales." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Item</th>
                      <th>Category</th>
                      <th className="right">Price</th>
                      <th className="right">Stock</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownMenu.map((m) => (
                      <tr key={m._id}>
                        <td className="num">{m.sku}</td>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td>{m.category}</td>
                        <td className="num">{formatNumber(m.price)}</td>
                        <td className="num">{m.stock}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => {
                                setModal("cafe-sale");
                                setForm({
                                  itemId: m._id,
                                  qty: "1",
                                  buyerType: "student",
                                });
                                setErr("");
                                setOpen(true);
                              }}
                            >
                              Sell
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => remove(m._id, "cafe-item")}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Counter Sales" meta={`${sales.length} RECEIPTS`}>
            {!sales.length ? (
              <EmptyState message="No sales recorded today." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Buyer</th>
                      <th>Items</th>
                      <th className="right">Total</th>
                      <th className="right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s._id}>
                        <td className="num">{s.number}</td>
                        <td>{prettyDate(s.saleDate)}</td>
                        <td>
                          <div>{s.buyerName || "Walk-in"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {s.buyerType}
                          </div>
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                        </td>
                        <td className="num">{formatNumber(s.total)}</td>
                        <td className="num">{formatNumber(s.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {active === "assets" ? (
        <Panel title={config.register} meta={`${shownAssets.length} ASSETS`}>
          {!shownAssets.length ? (
            <EmptyState message="No assets tagged yet. Register furniture, IT equipment or vehicles." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Asset</th>
                    <th>Category</th>
                    <th>Location / Custodian</th>
                    <th className="right">Cost</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownAssets.map((a) => (
                    <tr key={a._id}>
                      <td className="num">{a.tag}</td>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td>{a.category}</td>
                      <td>
                        <div>{a.location || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {a.assignedTo || "Unassigned"}
                        </div>
                      </td>
                      <td className="num">{formatNumber(a.purchaseCost)}</td>
                      <td className="right">
                        <StatusBadge status={a.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => remove(a._id, "asset")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {active === "documents" ? (
        <Panel title={config.register} meta={`${shownDocs.length} DOCUMENTS`}>
          {!shownDocs.length ? (
            <EmptyState message="No documents stored. Every upload keeps a version history." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Category</th>
                    <th>Owner</th>
                    <th className="right">Version</th>
                    <th>Updated</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownDocs.map((d) => (
                    <tr key={d._id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {d.fileUrl || "No file link"}
                        </div>
                      </td>
                      <td>{d.category}</td>
                      <td>
                        <div>{d.ownerName || "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {d.ownerType}
                        </div>
                      </td>
                      <td className="num">v{d.version}</td>
                      <td>{prettyDate(d.updatedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              post({
                                module: "document-bump",
                                id: d._id,
                                note: "Revised copy filed",
                              })
                            }
                          >
                            New Version
                          </button>
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => remove(d._id, "document")}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {active === "ai" ? (
        <Panel title={config.register} meta={`${jobs.length} JOBS`}>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-dim)" }}>
            AI runs through a service layer, never hard-coded into the database. Without{" "}
            <code>AI_PROVIDER_URL</code> a built-in stub returns structured drafts, so the model
            can be swapped later without touching any module.
          </p>
          {!jobs.length ? (
            <EmptyState message="No AI jobs yet. Run one to draft insights, papers or MCQs." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Prompt</th>
                    <th>Output</th>
                    <th>Provider</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j._id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{j.kind.replace(/_/g, " ")}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {prettyDate(j.createdAt)}
                        </div>
                      </td>
                      <td style={{ maxWidth: 200, fontSize: 11.5 }}>{j.prompt}</td>
                      <td style={{ maxWidth: 340, fontSize: 11.5, whiteSpace: "pre-wrap" }}>
                        {j.result}
                      </td>
                      <td className="num">{j.provider}</td>
                      <td className="right">
                        <StatusBadge status={j.status === "done" ? "completed" : j.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <ModalForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={submit}
        title={MODAL_TITLES[modal] || "Add Record"}
        submitLabel="Save"
      >
        {err ? <div className="alert err">{err}</div> : null}

        {modal === "timetable" ? (
          <div className="form-grid">
            <Field label="Day" required>
              <select
                className={inputClass}
                value={form.day || "mon"}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Period" required>
              <input
                type="number"
                min={1}
                max={12}
                className={inputClass}
                value={form.period || "1"}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                required
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                className={inputClass}
                value={form.startTime || ""}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                className={inputClass}
                value={form.endTime || ""}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </Field>
            <Field label="Class">
              <select
                className={inputClass}
                value={form.classId || ""}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">Not linked</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.section ? `-${c.section}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject">
              <select
                className={inputClass}
                value={form.subjectId || ""}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              >
                <option value="">Not linked</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teacher">
              <select
                className={inputClass}
                value={form.teacherId || ""}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
              >
                <option value="">Not linked</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Room / Lab">
              <input
                className={inputClass}
                value={form.room || ""}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="Room 12"
              />
            </Field>
            <Field label="Slot type">
              <select
                className={inputClass}
                value={form.slotKind || "class"}
                onChange={(e) => setForm({ ...form, slotKind: e.target.value })}
              >
                <option value="class">Class</option>
                <option value="lab">Lab</option>
                <option value="exam">Exam</option>
                <option value="free">Free period</option>
              </select>
            </Field>
          </div>
        ) : null}

        {modal === "book" ? (
          <div className="form-grid">
            <Field label="Title" required>
              <input
                className={inputClass}
                value={form.title || ""}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Author">
              <input
                className={inputClass}
                value={form.author || ""}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
            </Field>
            <Field label="ISBN">
              <input
                className={inputClass}
                value={form.isbn || ""}
                onChange={(e) => setForm({ ...form, isbn: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClass}
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="General"
              />
            </Field>
            <Field label="Copies" required>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.copies || "1"}
                onChange={(e) => setForm({ ...form, copies: e.target.value })}
                required
              />
            </Field>
            <Field label="Shelf location">
              <input
                className={inputClass}
                value={form.location || ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "issue" ? (
          <div className="form-grid">
            <Field label="Book" required>
              <select
                className={inputClass}
                value={form.bookId || ""}
                onChange={(e) => setForm({ ...form, bookId: e.target.value })}
                required
              >
                <option value="">Select a title…</option>
                {books
                  .filter((b) => b.available > 0)
                  .map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.title} — {b.available} available
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Borrower type">
              <select
                className={inputClass}
                value={form.borrowerType || "student"}
                onChange={(e) =>
                  setForm({ ...form, borrowerType: e.target.value, borrowerId: "" })
                }
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Borrower (master record)" required>
              <select
                className={inputClass}
                value={form.borrowerId || ""}
                onChange={(e) => setForm({ ...form, borrowerId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {(form.borrowerType === "teacher"
                  ? directory.teachers
                  : form.borrowerType === "staff"
                    ? directory.staff
                    : directory.students
                ).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan period (days)">
              <input
                type="number"
                min={1}
                max={90}
                className={inputClass}
                value={form.days || "14"}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "vehicle" ? (
          <div className="form-grid">
            <Field label="Vehicle code">
              <input
                className={inputClass}
                value={form.code || ""}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Leave blank for auto VEH-…"
              />
            </Field>
            <Field label="Registration / plate" required>
              <input
                className={inputClass}
                value={form.plateNo || ""}
                onChange={(e) => setForm({ ...form, plateNo: e.target.value })}
                required
              />
            </Field>
            <Field label="Vehicle type">
              <select
                className={inputClass}
                value={form.type || "bus"}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="bus">Bus</option>
                <option value="van">Van</option>
                <option value="car">Car</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Seating capacity">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.capacity || "30"}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Field>
            <Field label="Route name">
              <input
                className={inputClass}
                value={form.routeName || ""}
                onChange={(e) => setForm({ ...form, routeName: e.target.value })}
              />
            </Field>
            <Field label="Stops (comma separated)">
              <input
                className={inputClass}
                value={form.stops || ""}
                onChange={(e) => setForm({ ...form, stops: e.target.value })}
                placeholder="Gulberg, Model Town, Campus"
              />
            </Field>
            <Field label="Driver (staff / teacher)">
              <select
                className={inputClass}
                value={form.driverStaffId || ""}
                onChange={(e) => setForm({ ...form, driverStaffId: e.target.value })}
              >
                <option value="">Manual entry below…</option>
                {[...directory.staff, ...directory.teachers].map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Driver name (fallback)">
              <input
                className={inputClass}
                value={form.driverName || ""}
                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
              />
            </Field>
            <Field label="Driver phone">
              <input
                className={inputClass}
                value={form.driverPhone || ""}
                onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
              />
            </Field>
            <Field label="GPS tracker fitted">
              <select
                className={inputClass}
                value={form.gpsReady || "no"}
                onChange={(e) => setForm({ ...form, gpsReady: e.target.value })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
          </div>
        ) : null}

        {modal === "room" ? (
          <div className="form-grid">
            <Field label="Hostel name" required>
              <input
                className={inputClass}
                value={form.hostelName || ""}
                onChange={(e) => setForm({ ...form, hostelName: e.target.value })}
                required
              />
            </Field>
            <Field label="Building / block">
              <input
                className={inputClass}
                value={form.building || ""}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
              />
            </Field>
            <Field label="Room number" required>
              <input
                className={inputClass}
                value={form.roomNo || ""}
                onChange={(e) => setForm({ ...form, roomNo: e.target.value })}
                required
              />
            </Field>
            <Field label="Beds">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.beds || "2"}
                onChange={(e) => setForm({ ...form, beds: e.target.value })}
              />
            </Field>
            <Field label="Gender">
              <select
                className={inputClass}
                value={form.gender || "any"}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="any">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Monthly hostel fee">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.monthlyFee || "0"}
                onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "allocate" ? (
          <div className="form-grid">
            <Field label="Room" required>
              <select
                className={inputClass}
                value={form.roomId || ""}
                onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                required
              >
                <option value="">Select a room…</option>
                {rooms
                  .filter((r) => r.occupied < r.beds && r.status !== "maintenance")
                  .map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.hostelName} · {r.roomNo} ({r.beds - r.occupied} free)
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Student (master)" required>
              <select
                className={inputClass}
                value={form.studentId || ""}
                onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                required
              >
                <option value="">Select student…</option>
                {directory.students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bed number">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.bedNo || ""}
                onChange={(e) => setForm({ ...form, bedNo: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "visit" ? (
          <div className="form-grid">
            <Field label="Patient type">
              <select
                className={inputClass}
                value={form.personType || "student"}
                onChange={(e) =>
                  setForm({ ...form, personType: e.target.value, personId: "" })
                }
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Patient (master)" required>
              <select
                className={inputClass}
                value={form.personId || ""}
                onChange={(e) => setForm({ ...form, personId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {(form.personType === "teacher"
                  ? directory.teachers
                  : form.personType === "staff"
                    ? directory.staff
                    : directory.students
                ).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Visit date">
              <input
                type="date"
                className={inputClass}
                value={form.visitDate || ""}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
              />
            </Field>
            <Field label="Severity">
              <select
                className={inputClass}
                value={form.severity || "normal"}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </Field>
            <Field label="Complaint" required>
              <input
                className={inputClass}
                value={form.complaint || ""}
                onChange={(e) => setForm({ ...form, complaint: e.target.value })}
                required
              />
            </Field>
            <Field label="Diagnosis">
              <input
                className={inputClass}
                value={form.diagnosis || ""}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              />
            </Field>
            <Field label="Prescription">
              <input
                className={inputClass}
                value={form.prescription || ""}
                onChange={(e) => setForm({ ...form, prescription: e.target.value })}
              />
            </Field>
            <Field label="Attending doctor">
              <input
                className={inputClass}
                value={form.doctor || ""}
                onChange={(e) => setForm({ ...form, doctor: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "cafe-item" ? (
          <div className="form-grid">
            <Field label="SKU" required>
              <input
                className={inputClass}
                value={form.sku || ""}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="SNK-01"
                required
              />
            </Field>
            <Field label="Item name" required>
              <input
                className={inputClass}
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClass}
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Food"
              />
            </Field>
            <Field label="Price" required>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.price || ""}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
            </Field>
            <Field label="Opening stock">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.stock || "0"}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {modal === "cafe-sale" ? (
          <div className="form-grid">
            <Field label="Item" required>
              <select
                className={inputClass}
                value={form.itemId || ""}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                required
              >
                <option value="">Select an item…</option>
                {menu
                  .filter((m) => m.active && m.stock > 0)
                  .map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} — {formatNumber(m.price)} ({m.stock} left)
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Quantity" required>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.qty || "1"}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
              />
            </Field>
            <Field label="Buyer type">
              <select
                className={inputClass}
                value={form.buyerType || "student"}
                onChange={(e) =>
                  setForm({ ...form, buyerType: e.target.value, buyerId: "" })
                }
              >
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="guest">Guest</option>
              </select>
            </Field>
            {form.buyerType === "guest" ? (
              <Field label="Guest name">
                <input
                  className={inputClass}
                  value={form.buyerName || ""}
                  onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="Buyer (master)" required>
                <select
                  className={inputClass}
                  value={form.buyerId || ""}
                  onChange={(e) => setForm({ ...form, buyerId: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {(form.buyerType === "staff" ? directory.staff : directory.students).map(
                    (p) => (
                      <option key={p._id} value={p._id}>
                        {p.label}
                      </option>
                    )
                  )}
                </select>
              </Field>
            )}
          </div>
        ) : null}

        {modal === "asset" ? (
          <div className="form-grid">
            <Field label="Asset tag">
              <input
                className={inputClass}
                value={form.tag || ""}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                placeholder="Leave blank for auto AST-…"
              />
            </Field>
            <Field label="Asset name" required>
              <input
                className={inputClass}
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClass}
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Equipment"
              />
            </Field>
            <Field label="Location">
              <input
                className={inputClass}
                value={form.location || ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Assign to type">
              <select
                className={inputClass}
                value={form.assignedPersonType || "staff"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assignedPersonType: e.target.value,
                    assignedPersonId: "",
                  })
                }
              >
                <option value="staff">Staff</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
            </Field>
            <Field label="Assigned person">
              <select
                className={inputClass}
                value={form.assignedPersonId || ""}
                onChange={(e) => setForm({ ...form, assignedPersonId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {(form.assignedPersonType === "teacher"
                  ? directory.teachers
                  : form.assignedPersonType === "student"
                    ? directory.students
                    : directory.staff
                ).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Purchase cost">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.purchaseCost || "0"}
                onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={form.status || "in_use"}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="in_use">In use</option>
                <option value="idle">Idle</option>
                <option value="repair">Under repair</option>
                <option value="disposed">Disposed</option>
              </select>
            </Field>
          </div>
        ) : null}

        {modal === "document" ? (
          <div className="form-grid">
            <Field label="Document title" required>
              <input
                className={inputClass}
                value={form.title || ""}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClass}
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="General"
              />
            </Field>
            <Field label="Owner type">
              <select
                className={inputClass}
                value={form.ownerType || "student"}
                onChange={(e) =>
                  setForm({ ...form, ownerType: e.target.value, ownerId: "" })
                }
              >
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="teacher">Teacher</option>
                <option value="admission">Admission</option>
                <option value="vendor">Vendor</option>
                <option value="finance">Finance</option>
                <option value="other">Other</option>
              </select>
            </Field>
            {form.ownerType === "student" ||
            form.ownerType === "staff" ||
            form.ownerType === "teacher" ? (
              <Field label="Owner (master)" required>
                <select
                  className={inputClass}
                  value={form.ownerId || ""}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {(form.ownerType === "teacher"
                    ? directory.teachers
                    : form.ownerType === "staff"
                      ? directory.staff
                      : directory.students
                  ).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Owner name">
                <input
                  className={inputClass}
                  value={form.ownerName || ""}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </Field>
            )}
            <Field label="File link">
              <input
                className={inputClass}
                value={form.fileUrl || ""}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                placeholder="/uploads/…"
              />
            </Field>
          </div>
        ) : null}

        {modal === "ai" ? (
          <div className="form-grid one">
            <Field label="Job type" required>
              <select
                className={inputClass}
                value={form.aiKind || "insight"}
                onChange={(e) => setForm({ ...form, aiKind: e.target.value })}
              >
                <option value="insight">Management insight</option>
                <option value="admission_assistant">Admission assistant</option>
                <option value="chatbot">Chatbot reply draft</option>
                <option value="performance">Student performance analysis</option>
                <option value="weak_students">Weak student identification</option>
                <option value="report">Automated report outline</option>
                <option value="paper">Question paper blueprint</option>
                <option value="mcq">MCQ generation</option>
                <option value="fee_prediction">Fee recovery prediction</option>
              </select>
            </Field>
            <Field label="Prompt" required>
              <textarea
                className={inputClass}
                rows={4}
                value={form.prompt || ""}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder="Describe what you need — e.g. Grade 9 attendance and fee recovery for this month"
                required
              />
            </Field>
          </div>
        ) : null}
      </ModalForm>
    </>
  );
}
