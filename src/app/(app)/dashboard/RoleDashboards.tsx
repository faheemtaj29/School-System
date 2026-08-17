"use client";

/** Personal dashboards for teacher and student sessions. */
import Link from "next/link";
import { EmptyState, Panel, StatusBadge } from "@/components/ui";
import { dayMonth, formatNumber, prettyDate } from "@/lib/types";

type Ref = { _id: string; name?: string; code?: string; title?: string; section?: string };

export type TeacherData = {
  linked: boolean;
  profile: { name: string; employeeId: string; qualification: string; branchCode: string };
  stats: {
    classes: number;
    subjects: number;
    students: number;
    courses: number;
    attendanceRate: number;
    pendingAttendance: number;
  };
  classes: { _id: string; name: string; section: string; room: string; markedToday: boolean }[];
  subjects: Ref[];
  upcomingExams: { _id: string; title: string; date: string; classId?: Ref; subjectId?: Ref }[];
  courses: {
    _id: string;
    code: string;
    title: string;
    status: string;
    mode: string;
    learners: number;
    avgProgress: number;
    maxSeats: number;
  }[];
  lectures: {
    _id: string;
    title: string;
    type: string;
    status: string;
    scheduledAt?: string;
    meetingUrl?: string;
    courseId?: Ref;
  }[];
  payslips: { _id: string; month: string; net: number; status: string }[];
  leaves: { _id: string; leaveType: string; fromDate: string; days: number; status: string }[];
  notices: { _id: string; title: string; priority: string; publishDate: string }[];
};

export type StudentData = {
  linked: boolean;
  profile: {
    name: string;
    admissionNo: string;
    rollNumber: string;
    className: string;
    branchCode: string;
  };
  stats: {
    attendanceRate: number;
    presentDays: number;
    markedDays: number;
    todayStatus: string | null;
    billed: number;
    paid: number;
    due: number;
    overdue: number;
    courses: number;
    diplomas: number;
    avgScore: number;
  };
  attendanceHistory: { date: string; status: string }[];
  fees: { _id: string; title: string; amount: number; paidAmount: number; dueDate: string; status: string }[];
  results: {
    _id: string;
    title: string;
    examType: string;
    date: string;
    subject?: Ref;
    maxMarks: number;
    marks: number | null;
    grade: string;
    percent: number;
  }[];
  enrollments: {
    _id: string;
    status: string;
    progress: number;
    completedLectureIds?: string[];
    courseId?: Ref & { mode?: string; level?: string; status?: string; liveLink?: string };
  }[];
  lectures: {
    _id: string;
    title: string;
    type: string;
    status: string;
    scheduledAt?: string;
    meetingUrl?: string;
    recordingUrl?: string;
    courseId?: Ref;
  }[];
  diplomas: { _id: string; title: string; diplomaNo: string; issueDate: string; grade?: string }[];
  notices: { _id: string; title: string; priority: string; publishDate: string }[];
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Progress({ value, tone }: { value: number; tone?: string }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} />
    </div>
  );
}

export function UnlinkedNotice({ role }: { role: string }) {
  return (
    <>
      <div className="hero">
        <div className="hero-text">
          <h1>Welcome</h1>
          <div className="sub">Your account is not linked to a {role} record yet</div>
        </div>
      </div>
      <Panel title="Profile not linked">
        <EmptyState
          message={`Ask the school administrator to connect your login to your ${role} profile. Once linked, your classes, attendance, fees and courses appear here.`}
        />
      </Panel>
    </>
  );
}

export function TeacherDashboard({ data }: { data: TeacherData }) {
  const { profile, stats } = data;
  return (
    <>
      <div className="hero">
        <div className="hero-text">
          <h1>
            {greeting()}, {profile.name.split(" ")[0]}
          </h1>
          <div className="sub">
            {profile.employeeId} · {stats.classes} classes · {stats.students} students
            <span className="live">{profile.branchCode || "MAIN"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          <Link href="/attendance" className="btn-primary">Mark Attendance</Link>
          <Link
            href="/exams"
            className="btn-primary"
            style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}
          >
            Enter Results
          </Link>
        </div>
      </div>

      <div className="kpi-row four colorful">
        <Link href="/classes" className="kpi c1">
          <div className="tag">My Classes</div>
          <div className="num">{stats.classes}</div>
        </Link>
        <Link href="/students" className="kpi c2">
          <div className="tag">My Students</div>
          <div className="num">{stats.students}</div>
        </Link>
        <Link href="/attendance" className="kpi c3">
          <div className="tag">Attendance (30d)</div>
          <div className="num">{stats.attendanceRate}%</div>
        </Link>
        <Link href="/distance-learning" className="kpi c6">
          <div className="tag">My Courses</div>
          <div className="num">{stats.courses}</div>
        </Link>
      </div>

      <div className="grid-2">
        <div>
          <Panel
            title="Today's Register"
            meta={stats.pendingAttendance ? `${stats.pendingAttendance} PENDING` : "ALL MARKED"}
          >
            {!data.classes.length ? (
              <EmptyState message="No classes assigned to you yet." />
            ) : (
              data.classes.map((c) => (
                <div className="deadline-row" key={c._id}>
                  <div>
                    <div className="dname">
                      {c.name} - {c.section}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {c.room || "No room"}
                    </div>
                  </div>
                  {c.markedToday ? (
                    <StatusBadge status="present" />
                  ) : (
                    <Link href="/attendance" className="link-btn">
                      Mark now
                    </Link>
                  )}
                </div>
              ))
            )}
          </Panel>

          <Panel title="My Courses" meta={`${data.courses.length} ACTIVE`}>
            {!data.courses.length ? (
              <EmptyState message="No distance learning courses assigned." />
            ) : (
              data.courses.map((course) => (
                <div className="course-row" key={course._id}>
                  <div className="course-head">
                    <div>
                      <div className="dname">{course.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {course.code} · {course.mode} · {course.learners}/{course.maxSeats} learners
                      </div>
                    </div>
                    <StatusBadge status={course.status} />
                  </div>
                  <Progress value={course.avgProgress} />
                  <div className="course-foot">Average progress {course.avgProgress}%</div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Upcoming Exams" meta="NEXT 6">
            {!data.upcomingExams.length ? (
              <EmptyState message="No exams scheduled for your classes." />
            ) : (
              data.upcomingExams.map((exam) => {
                const d = dayMonth(exam.date);
                return (
                  <div className="deadline-row" key={exam._id}>
                    <div>
                      <div className="dname">{exam.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                        {exam.classId ? `${exam.classId.name} - ${exam.classId.section}` : "—"}
                        {exam.subjectId ? ` · ${exam.subjectId.name}` : ""}
                      </div>
                    </div>
                    <span className="d">
                      {d.day} {d.month}
                    </span>
                  </div>
                );
              })
            )}
          </Panel>
        </div>

        <div>
          <Panel title="Live & Scheduled Lectures">
            {!data.lectures.length ? (
              <EmptyState message="No upcoming lectures." />
            ) : (
              data.lectures.map((lecture) => (
                <div className="deadline-row" key={lecture._id}>
                  <div>
                    <div className="dname">{lecture.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {lecture.courseId?.code} · {prettyDate(lecture.scheduledAt)}
                    </div>
                  </div>
                  {lecture.meetingUrl ? (
                    <a className="link-btn" href={lecture.meetingUrl} target="_blank" rel="noreferrer">
                      Join
                    </a>
                  ) : (
                    <StatusBadge status={lecture.status} />
                  )}
                </div>
              ))
            )}
          </Panel>

          <Panel title="My Subjects">
            {!data.subjects.length ? (
              <EmptyState message="No subjects assigned." />
            ) : (
              <div className="chips">
                {data.subjects.map((s) => (
                  <span className="chip" key={s._id}>
                    {s.name} {s.code ? `(${s.code})` : ""}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Payslips" meta="LATEST 4">
            {!data.payslips.length ? (
              <EmptyState message="No payslips issued yet." />
            ) : (
              data.payslips.map((p) => (
                <div className="deadline-row" key={p._id}>
                  <div className="dname">{p.month}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="num">{formatNumber(p.net)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Leave Requests">
            {!data.leaves.length ? (
              <EmptyState message="No leave requests." />
            ) : (
              data.leaves.map((l) => (
                <div className="deadline-row" key={l._id}>
                  <div>
                    <div className="dname" style={{ textTransform: "capitalize" }}>
                      {l.leaveType} · {l.days}d
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      From {prettyDate(l.fromDate)}
                    </div>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))
            )}
          </Panel>

          <NoticeBoard notices={data.notices} />
        </div>
      </div>
    </>
  );
}

export function StudentDashboard({ data }: { data: StudentData }) {
  const { profile, stats } = data;
  const paidPct = stats.billed ? Math.round((stats.paid / stats.billed) * 100) : 0;

  return (
    <>
      <div className="hero">
        <div className="hero-text">
          <h1>
            {greeting()}, {profile.name.split(" ")[0]}
          </h1>
          <div className="sub">
            {profile.className} · Roll {profile.rollNumber || "—"} · {profile.admissionNo}
            {stats.todayStatus ? (
              <span className="live">TODAY: {stats.todayStatus.toUpperCase()}</span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          <Link href="/distance-learning" className="btn-primary">My Courses</Link>
          <Link
            href="/fees"
            className="btn-primary"
            style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}
          >
            Fee Vouchers
          </Link>
        </div>
      </div>

      <div className="kpi-row four colorful">
        <div className="kpi c1">
          <div className="tag">Attendance</div>
          <div className="num">{stats.attendanceRate}%</div>
        </div>
        <div className="kpi c3">
          <div className="tag">Average Score</div>
          <div className="num">{stats.avgScore}%</div>
        </div>
        <div className="kpi c5">
          <div className="tag">Fee Due</div>
          <div className="num">{formatNumber(stats.due)}</div>
        </div>
        <div className="kpi c6">
          <div className="tag">Courses</div>
          <div className="num">{stats.courses}</div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <Panel title="My Courses" meta={`${data.enrollments.length} ENROLLED`}>
            {!data.enrollments.length ? (
              <EmptyState message="You are not enrolled in any course yet." />
            ) : (
              data.enrollments.map((e) => (
                <div className="course-row" key={e._id}>
                  <div className="course-head">
                    <div>
                      <div className="dname">{e.courseId?.title || "Course"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {e.courseId?.code} · {e.courseId?.mode} · {e.courseId?.level}
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                  <Progress value={e.progress} />
                  <div className="course-foot">
                    <span>
                      {e.progress}% complete · {e.completedLectureIds?.length || 0} lectures done
                    </span>
                    {e.courseId?.liveLink ? (
                      <a href={e.courseId.liveLink} target="_blank" rel="noreferrer" className="link-btn">
                        Live class
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Exam Results" meta="LATEST 6">
            {!data.results.length ? (
              <EmptyState message="No results published yet." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Subject</th>
                      <th className="right">Marks</th>
                      <th className="right">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {prettyDate(r.date)} · {r.examType}
                          </div>
                        </td>
                        <td>{r.subject?.name || "—"}</td>
                        <td className="num">
                          {r.marks ?? "—"} / {r.maxMarks}
                        </td>
                        <td className="right">
                          <StatusBadge status={r.grade || `${r.percent}%`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Fee Vouchers" meta={`${paidPct}% PAID`}>
            {!data.fees.length ? (
              <EmptyState message="No fee vouchers issued." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Voucher</th>
                      <th>Due Date</th>
                      <th className="right">Amount</th>
                      <th className="right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fees.map((f) => (
                      <tr key={f._id}>
                        <td>{f.title}</td>
                        <td>{prettyDate(f.dueDate)}</td>
                        <td className="num">
                          {formatNumber(f.paidAmount)} / {formatNumber(f.amount)}
                        </td>
                        <td className="right">
                          <StatusBadge status={f.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="Attendance" meta={`${stats.presentDays}/${stats.markedDays} DAYS`}>
            <Progress value={stats.attendanceRate} />
            <div className="attend-dots">
              {data.attendanceHistory.map((h) => (
                <span key={h.date} className={`attend-dot ${h.status}`} title={`${prettyDate(h.date)} — ${h.status}`}>
                  {h.status[0].toUpperCase()}
                </span>
              ))}
            </div>
            {!data.attendanceHistory.length ? (
              <EmptyState message="No attendance marked in the last 30 days." />
            ) : null}
          </Panel>

          <Panel title="Lectures & Recordings">
            {!data.lectures.length ? (
              <EmptyState message="No lectures available." />
            ) : (
              data.lectures.map((lecture) => (
                <div className="deadline-row" key={lecture._id}>
                  <div>
                    <div className="dname">{lecture.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {lecture.courseId?.code} · {lecture.type}
                      {lecture.scheduledAt ? ` · ${prettyDate(lecture.scheduledAt)}` : ""}
                    </div>
                  </div>
                  {lecture.meetingUrl || lecture.recordingUrl ? (
                    <a
                      className="link-btn"
                      href={lecture.meetingUrl || lecture.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lecture.type === "live" ? "Join" : "Watch"}
                    </a>
                  ) : (
                    <StatusBadge status={lecture.status} />
                  )}
                </div>
              ))
            )}
          </Panel>

          <Panel title="Certificates & Diplomas">
            {!data.diplomas.length ? (
              <EmptyState message="No certificates issued yet." />
            ) : (
              data.diplomas.map((d) => (
                <div className="deadline-row" key={d._id}>
                  <div>
                    <div className="dname">{d.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {d.diplomaNo} · {prettyDate(d.issueDate)}
                    </div>
                  </div>
                  <StatusBadge status={d.grade || "issued"} />
                </div>
              ))
            )}
          </Panel>

          <NoticeBoard notices={data.notices} />
        </div>
      </div>
    </>
  );
}

function NoticeBoard({ notices }: { notices: { _id: string; title: string; priority: string; publishDate: string }[] }) {
  return (
    <Panel title="Notice Board">
      {!notices.length ? (
        <EmptyState message="No notices published." />
      ) : (
        notices.map((n) => (
          <div className="deadline-row" key={n._id}>
            <div>
              <div className="dname">{n.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                {prettyDate(n.publishDate)}
              </div>
            </div>
            <StatusBadge status={n.priority} />
          </div>
        ))
      )}
    </Panel>
  );
}
