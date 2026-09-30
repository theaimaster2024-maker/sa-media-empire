# Video Upload workflow and dashboard refinement

Done -> Complete project -> Ready to upload -> Uploaded -> Published.
Completion remains the existing is_completed flag; completed projects appear in
both their editor Payment history and the staff Video Upload page. Upload fields
live on editor_projects, so completing twice cannot create duplicate queue rows.
Payment fields and linked Finance expenses are independent of upload status.

Owner and manager can update upload status, channel, YouTube URL and notes. The
server rejects changes from editors and rejects upload updates before completion.
Published requires a YouTube URL. Confirmation timestamps are server assigned.
Reopening a completed project resets upload state to Ready and clears confirmation
times; the URL, channel and notes remain as references. The row leaves the queue
until it is completed again. No videos are transmitted to YouTube by this app.

Forms load fresh data and condition writes on updated_at to prevent stale updates.
The page has Ready/Uploaded/Published/all filters and title/editor search. Source
submission links, YouTube link and an Open project action are available per video.

Dashboard typography is larger, with a calmer purple/ivory style. Progress ring,
stage counts and KPI cards open matching project groups or the upload queue;
project rows/deadlines open the actual project, and editor rows open the workspace.

Expense Tracker navigation is removed. Its 6 existing entries remain unchanged in
the expenses table and are visible under Finance > Transactions > Previous Expense
Tracker records. They are historical archive records excluded from the current
Finance balance, avoiding changes to the user's fresh 500k-based accounts.

Validation: main and board syntax checks; DOM tests for dashboard/role/empty states,
project destinations, upload filters, Published link validation and save behavior;
rolled-back database tests for completion prerequisite, uploaded/published timing,
reopening, unchanged payment state, manager access and editor denial; inline handler
resolution; security advisors show no new findings. Browser visual check uses only
isolated mock records. No production video was marked uploaded/published for testing.
