# Finance corrections and channel references

Finance owners can open the compact entry menu on Overview, Transactions, Requests,
channel detail, Payroll and Subscriptions. Edit forms load fresh rows and channels;
conditional updates/deletes reject stale data. Deletion asks for confirmation.
No existing business entries are cleared by this release.

Linked editor payments permit scope/channel and descriptive corrections. Amount,
paid status and payment date follow the project. Delete a mistaken payment record,
correct the project, then record payment again. The database deletes the ledger row
and resets the project to Unpaid in one transaction; manager deletion is denied.
Deletion is bookkeeping only and never refunds money. Applied SQL is recorded in
supabase/sql/finance-entry-corrections.sql.

Script Studio recognizes HTTP(S) and www links in text, notes and cards, preserving
rich formatting. Links open in a separate tab. The sanitizer keeps only safe anchor
URLs. Existing YouTube video and Drive previews remain supported.

YouTube channel URLs create channel cards with name, logo, description and an open
channel link. Double-click the card's top bar to edit the URL/name/logo. Metadata
lookup uses the authenticated studio-channel-preview Edge Function: user validation,
staff or board-edit membership, fixed YouTube origin, no redirects, timeout and
bounded response size. No YouTube API key is needed. YouTube can withhold metadata;
the optional name/logo fields provide a manual fallback. This is a preview card,
not an embedded channel browser. Metadata is saved with the board item and is thus
visible to invited/public viewers without a new metadata request.

Validation: main/board JS syntax; DOM tests for safe linkification, channel URL
normalization, card rendering, existing embeds, finance editing and role visibility;
real public channel HTML metadata extraction; database rollback tests for linked
payment scope correction, immutable amount, atomic delete/unpaid reset, recording
payment again, and manager denial. Advisors show no new findings.
