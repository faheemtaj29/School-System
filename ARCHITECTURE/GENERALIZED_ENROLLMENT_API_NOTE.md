# Generalized Enrollment API Note

Implemented on 2026-08-16.

## Endpoint
- PUT /api/students/:id

## New action payload
Use `kind: "enrollment"` to append academic history records without creating duplicate student identities.

Example payload:

{
  "kind": "enrollment",
  "contextType": "program_semester",
  "progressionAction": "semester_promotion",
  "academicYear": "2026-27",
  "facultyName": "School of Computing",
  "departmentName": "Computer Science",
  "programName": "BS Computer Science",
  "programCode": "BSCS",
  "semesterNumber": 3,
  "termName": "Fall",
  "batchName": "2025",
  "status": "active",
  "closePrevious": true,
  "note": "Promoted to semester 3"
}

## Supported contexts
- class
- program_semester
- research_stage

## Backward compatibility
- Existing student create/update and promotion behavior remains unchanged.
- Existing class-based enrollment history continues to work.
- New generalized context is additive and optional.
