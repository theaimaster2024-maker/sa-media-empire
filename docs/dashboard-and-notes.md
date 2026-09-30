# Dashboard and workspace navigation

Home is now the single Dashboard. The previous expense-only Dashboard page and
loader have been removed; old dashboard routes resolve to Home. Sidebar order:
Dashboard, Editors, Scriptbook, Notes, Expense Tracker, Finance, Team Members.
Existing role visibility remains, except Notes now supports owners and managers.
Editors still see Editors and shared Scriptbook boards only.

Dashboard CSS is isolated in dashboard.css. Live project data drives active counts,
review queue, overdue deadlines, pipeline and team workload. Completed means
is_completed, not merely Done. Finance snapshot is owner-only and uses received
income/paid expenses from Finance, separately from the legacy Expense Tracker.
Dates use Asia/Dhaka. No sample records are inserted into the database.

Notes uses the existing first private_notes record as the shared staff workspace.
Existing content is preserved; the former shared_notes data remains stored and
unchanged, but its separate navigation entry is removed. RLS allows owner/manager
read and update, staff-owned inserts, and owner-only deletion. Editors have no
access. Saves compare updated_at to reject stale overwrites and retain pending text.

Validation: JS syntax; DOM tests for navigation, completion counts, empty states and
manager finance isolation; rolled-back RLS tests for manager read/update and editor
denial. Existing security advisor findings are unchanged.
