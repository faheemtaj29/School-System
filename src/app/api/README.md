# API routes (`src/app/api`)

These files are **thin entry points** only. Real logic lives in `src/backend/`.

## Example

```ts
// src/app/api/students/route.ts
import { studentController } from "@/backend/controllers/student.controller";

export const GET = studentController.list;
export const POST = studentController.create;
```

## Endpoints

| Method | Path | Controller |
|--------|------|------------|
| POST | `/api/auth/login` | auth.login |
| PUT | `/api/auth/login` | auth.setup |
| POST | `/api/auth/logout` | auth.logout |
| GET | `/api/auth/me` | auth.me |
| GET | `/api/dashboard` | dashboard.overview |
| GET/POST | `/api/students` | student.list / create |
| GET/PUT/DELETE | `/api/students/[id]` | student.get / update / remove |
| GET/POST | `/api/teachers` | teacher.* |
| GET/PUT/DELETE | `/api/teachers/[id]` | teacher.* |
| GET/POST | `/api/classes` | class.* |
| GET/PUT/DELETE | `/api/classes/[id]` | class.* |
| GET/POST | `/api/subjects` | subject.* |
| PUT/DELETE | `/api/subjects/[id]` | subject.* |
| GET/POST | `/api/attendance` | attendance.list / save |
| GET/POST | `/api/exams` | exam.* |
| PUT/DELETE | `/api/exams/[id]` | exam.* |
| GET/POST | `/api/fees` | fee.* |
| PUT/DELETE | `/api/fees/[id]` | fee.* |

| GET | `/api/reports?type=` | reports.run |
| GET/PUT | `/api/settings` | settings.* |
| GET/POST | `/api/accounting` | accounting.* |
| DELETE | `/api/accounting/[id]` | accounting.remove |
| GET/POST | `/api/inventory` | inventory.* |
| PUT/DELETE | `/api/inventory/[id]` | inventory.* |
| GET/POST | `/api/hr` | hr.overview / createLeave |
| PUT/DELETE | `/api/hr/leave/[id]` | hr leave |
| POST | `/api/hr/payslips` | hr.createPayslip |
| PUT/DELETE | `/api/hr/payslips/[id]` | hr payslip |
| GET/POST | `/api/notices` | notice.* |
| DELETE | `/api/notices/[id]` | notice.remove |

See **`src/backend/README.md`** for the full backend map.
