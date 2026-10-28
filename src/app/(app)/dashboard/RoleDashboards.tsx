"use client";

/** Personal dashboards for teacher and student sessions. */
import Link from "next/link";
import { EmptyState, Panel, StatusBadge } from "@/components/ui";
import { formatNumber, prettyDate } from "@/lib/types";

type Ref = { _id: string; name?: string; code?: string; title?: string; section?: string };

export type TeacherData = {
  linked: boolean;
  profile: {
    name: string;
    employeeId: string;
    designation: string;
    department: string;
    qualification: string;
    branchCode: string;
  };
  stats: {
    classes: number;
    subjects: number;
    students: number;
    courses: number;
    attendanceRate: number;
    pendingAttendance: number;
    pendingMarks: number;
  };
  classes: {
    _id: string;
    name: string;
    section: string;
    room: string;
    markedToday: boolean;
    subjects: Ref[];
  }[];
  subjects: Ref[];
  timetable: {
    _id: string;
    period: number;
    startTime?: string;
    endTime?: string;
    room?: string;
    kind: string;
    classId?: Ref;
    subjectId?: Ref;
  }[];
  upcomingExams: {
    _id: string;
    scheduleId: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    maxMarks: number;
    room: string;
    classId?: Ref;
    subjectId?: Ref;
    term: string;
    examType: string;
  }[];
  pendingMarks: {
    scheduleId: string;
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    date: string;
    maxMarks: number;
    missingMarks: number;
    students: number;
    examType: string;
    termLabel: string;
    academicYear: string;
  }[];
  attendanceActivity: {
    _id: string;
    date: string;
    classId?: Ref;
    records: { status: string }[];
  }[];
  marksActivity: {
    _id: string;
    title: string;
    date: string;
    updatedAt: string;
    classId?: Ref;
    subjectId?: Ref;
    results: { studentId: string; marks: number; grade?: string }[];
  }[];
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
    fineAmount: number;
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
  );
}

export function TeacherDashboard({ data }: { data: TeacherData }) {
  const { profile, stats } = data;
  return (
    <div className="role-dashboard teacher-role-dashboard">
      <div className="hero role-dashboard-hero">
        <div className="hero-text">
          <h1>
            {greeting()}, {profile.name.split(" ")[0]}
          </h1>
          <div className="sub">
            {profile.employeeId}
            {profile.designation ? ` · ${profile.designation}` : ""}
            {profile.department ? ` · ${profile.department}` : ""}
            <span className="live">{profile.branchCode || "MAIN"}</span>
          </div>
          {profile.qualification ? <div className="sub">{profile.qualification}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          <Link href="/attendance" className="btn-primary">Take Attendance</Link>
          <Link href="/exams?tab=schedules" className="btn-primary" style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}>
            View Exam Schedule
          </Link>
          <Link href="/exams?tab=results" className="btn-primary" style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}>
            View Results
          </Link>
        </div>
      </div>

      <div className="role-summary-grid">
        <Link href="/students" className="role-summary-card jade">
          <span>Assigned classes</span>
          <b>{stats.classes}</b>
          <small>{stats.subjects} subjects assigned</small>
        </Link>
        <Link href="/students" className="role-summary-card blue">
          <span>Assigned students</span>
          <b>{stats.students}</b>
          <small>Across your class rosters</small>
        </Link>
        <Link href="/attendance" className="role-summary-card amber">
          <span>Attendance pending</span>
          <b>{stats.pendingAttendance}</b>
          <small>Class registers to complete today</small>
        </Link>
        <Link href="/exams?tab=schedules" className="role-summary-card red">
          <span>Marks entry pending</span>
          <b>{stats.pendingMarks}</b>
          <small>Published exam tasks</small>
        </Link>
      </div>

      <div className="grid-2 role-dashboard-grid">
        <div>
          <Panel title="My Classes & Subjects" meta={`${stats.students} STUDENTS`}>
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
                      {c.subjects.map((subject) => subject.name).join(" · ") || "No assigned subjects"}
                    </div>
                  </div>
                  <Link href={`/students?classId=${encodeURIComponent(c._id)}`} className="link-btn">View roster</Link>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Today's Timetable" meta={`${data.timetable.length} PERIODS`}>
            {!data.timetable.length ? (
              <EmptyState message="No timetable periods are assigned for today." />
            ) : (
              data.timetable.map((slot) => (
                <div className="deadline-row" key={slot._id}>
                  <div>
                    <div className="dname">
                      {slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime} · ` : `Period ${slot.period} · `}
                      {slot.subjectId?.name || slot.kind}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {slot.classId ? `${slot.classId.name} - ${slot.classId.section || ""}` : "—"}
                      {slot.room ? ` · Room ${slot.room}` : ""}
                    </div>
                  </div>
                  <span className="d">P{slot.period}</span>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Upcoming Published Exams" meta="NEXT 6">
            {!data.upcomingExams.length ? (
              <EmptyState message="No published exams are scheduled for your assigned subjects." />
            ) : (
              data.upcomingExams.map((exam) => (
                <div className="deadline-row" key={exam._id}>
                  <div>
                    <div className="dname">{exam.subjectId?.name || exam.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {exam.classId ? `${exam.classId.name} - ${exam.classId.section}` : "—"}
                      {exam.term ? ` · ${exam.term}` : ""}
                      {exam.startTime ? ` · ${exam.startTime}${exam.endTime ? `–${exam.endTime}` : ""}` : ""}
                    </div>
                  </div>
                  <span className="d">{prettyDate(exam.date)}</span>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Recent Teaching Activity">
            {!data.attendanceActivity.length && !data.marksActivity.length ? (
              <EmptyState message="No attendance or marks activity recorded yet." />
            ) : (
              <>
                {data.attendanceActivity.map((sheet) => (
                  <div className="deadline-row" key={`attendance-${sheet._id}`}>
                    <div>
                      <div className="dname">Attendance · {sheet.classId?.name || "Class"} {sheet.classId?.section || ""}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{prettyDate(sheet.date)} · {sheet.records.length} students marked</div>
                    </div>
                    <StatusBadge status="saved" />
                  </div>
                ))}
                {data.marksActivity.map((exam) => (
                  <div className="deadline-row" key={`marks-${exam._id}`}>
                    <div>
                      <div className="dname">{exam.subjectId?.name || exam.title} · Marks saved</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                        {exam.classId?.name || "Class"} {exam.classId?.section || ""} · {prettyDate(exam.updatedAt || exam.date)} · {exam.results.length} records
                      </div>
                    </div>
                    <Link href="/exams?tab=results" className="link-btn">View</Link>
                  </div>
                ))}
              </>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="Pending Attendance" meta={`${stats.pendingAttendance} TO DO`}>
            {!data.classes.some((item) => !item.markedToday) ? (
              <EmptyState message="All assigned class registers are saved for today." />
            ) : (
              data.classes.filter((item) => !item.markedToday).map((c) => (
                <div className="deadline-row" key={c._id}>
                  <div>
                    <div className="dname">{c.name} - {c.section}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{c.room || "No room assigned"}</div>
                  </div>
                  <Link href={`/attendance?classId=${encodeURIComponent(c._id)}`} className="link-btn">Take Attendance</Link>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Marks Entry & Result Preparation" meta={`${data.pendingMarks.length} PENDING`}>
            {!data.pendingMarks.length ? (
              <EmptyState message="No published exam is awaiting marks entry." />
            ) : (
              data.pendingMarks.map((task) => (
                <div className="deadline-row" key={`${task.scheduleId}-${task.subjectId}`}>
                  <div>
                    <div className="dname">{task.subjectName} · {task.className}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {task.termLabel} · {prettyDate(task.date)} · {task.missingMarks} of {task.students} marks missing
                    </div>
                  </div>
                  <Link
                    href={`/exams?tab=marksheet&classId=${encodeURIComponent(task.classId)}&scheduleId=${encodeURIComponent(task.scheduleId)}&subjectId=${encodeURIComponent(task.subjectId)}&date=${encodeURIComponent(new Date(task.date).toISOString().slice(0, 10))}&term=${encodeURIComponent(task.termLabel)}&examType=${encodeURIComponent(task.examType.toLowerCase())}`}
                    className="link-btn"
                  >Enter Marks</Link>
                </div>
              ))
            )}
          </Panel>

          <NoticeBoard notices={data.notices} />

          {data.courses.length ? (
            <Panel title="Other Teaching Work" meta={`${data.courses.length} COURSES`}>
              {data.courses.slice(0, 3).map((course) => (
                <div className="deadline-row" key={course._id}>
                  <div>
                    <div className="dname">{course.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{course.code} · {course.learners} learners</div>
                  </div>
                  <Link href="/distance-learning" className="link-btn">Open</Link>
                </div>
              ))}
            </Panel>
          ) : null}

          <Panel title="My Teaching Responsibilities">
            <div className="deadline-row">
              <div>
                <div className="dname">30-day attendance rate</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Across assigned classes</div>
              </div>
              <strong>{stats.attendanceRate}%</strong>
            </div>
            <div className="deadline-row">
              <div>
                <div className="dname">Assigned students</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Active class roster</div>
              </div>
              <strong>{stats.students}</strong>
            </div>
            <div className="deadline-row">
              <div>
                <div className="dname">Browse published schedules and results</div>
              </div>
              <Link href="/exams?tab=schedules" className="link-btn">Open Exams</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function StudentDashboard({ data }: { data: StudentData }) {
  const { profile, stats } = data;
  const paidPct = stats.billed ? Math.round((stats.paid / stats.billed) * 100) : 0;

  return (
    <div className="role-dashboard student-role-dashboard">
      <div className="hero role-dashboard-hero">
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

      <div className="role-summary-grid student-fee-summary">
        <div className="role-summary-card jade">
          <span>Total Fee</span>
          <b>{formatNumber(stats.billed)}</b>
          <small>All issued challans</small>
        </div>
        <div className="role-summary-card blue">
          <span>Paid Amount</span>
          <b>{formatNumber(stats.paid)}</b>
          <small>{paidPct}% of billed fees</small>
        </div>
        <div className="role-summary-card amber">
          <span>Pending Amount</span>
          <b>{formatNumber(stats.due)}</b>
          <small>Remaining fee balance</small>
        </div>
        <div className="role-summary-card red">
          <span>Fine Amount</span>
          <b>{formatNumber(stats.fineAmount)}</b>
          <small>Applied late fees</small>
        </div>
      </div>

      <div className="grid-2 role-dashboard-grid">
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

          <Panel title="Fees & Payments" meta={`${paidPct}% PAID`}>
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
          <Panel title="Student Information" meta={profile.branchCode || "STUDENT PROFILE"}>
            <div className="student-profile-summary">
              <div>
                <span>Class / Section</span>
                <strong>{profile.className}</strong>
              </div>
              <div>
                <span>Roll number</span>
                <strong>{profile.rollNumber || "—"}</strong>
              </div>
              <div>
                <span>Admission number</span>
                <strong>{profile.admissionNo}</strong>
              </div>
              <div>
                <span>Average result</span>
                <strong>{stats.avgScore}%</strong>
              </div>
              <div>
                <span>Courses enrolled</span>
                <strong>{stats.courses}</strong>
              </div>
              <div>
                <span>Certificates earned</span>
                <strong>{stats.diplomas}</strong>
              </div>
            </div>
          </Panel>

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
    </div>
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
