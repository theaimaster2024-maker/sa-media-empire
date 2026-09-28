# Finance and original images — 28 September 2026

## Finance

The owner records an editor payment after the project is completed. The confirmation form loads the current channel list, shows the exact total, and requires Whole Business or a channel. It records an already-made payment; it does not transfer money.

`record_editor_payment` locks the project row and writes both the Finance expense and project payment in one database transaction. A unique project link makes repeat/concurrent requests idempotent. The server checks owner role, completion, current amount and channel existence. Direct payment edits without a matching ledger are rejected. Linked paid expenses and paid project totals cannot be changed through ordinary edits. General project editing no longer submits payment status or paid amount.

Any newly added editor/channel uses this same flow. Channel Performance cards show the selected month's received income, paid expense and net. Opening a channel shows exact monthly and all-time amounts plus all transactions, including pending/approved items. Whole Business has a separate detail view; the overview balance includes every scope.

Summary amounts use lowercase k (500k, 10k, -12.5k). Details, confirmations, transaction rows and invoices retain exact amounts.

The user-authorized reset cleared Finance income, expenses, payroll, subscriptions, notes/audit and editor payment/invoice metadata. Opening balance is BDT 500,000. Channels, editors, projects, rates and board contents were preserved. A restricted database recovery snapshot exists in `maintenance_private.finance_reset_backups`. SQL in `supabase/sql/` is an archival record of applied changes, NOT a script to re-run on production.

## Original images

Uploads now store the original File bytes in the private `studio-originals` bucket, with no resize/re-encoding. Supported formats: PNG, JPEG, WebP, GIF, AVIF, BMP; maximum 20 MB per original. Board display dimensions are independent of original pixel dimensions.

A Download original button is available to board viewers and editors, including public link viewers. It downloads the stored original, retaining its filename. Legacy compressed images remain downloadable at their previously saved quality.

The `studio-image-access` Edge Function validates either a current user (owner/manager or board member) or a board's exact public share token. It only signs paths referenced by non-deleted images in that board. Signed URLs expire after five minutes. Revoking a link stops issuing new URLs; already-issued URLs expire within five minutes. The function uses custom authentication, so gateway verify_jwt is disabled intentionally. The bucket is not public, and upload RLS requires board edit access.

## Verification

- JavaScript syntax and existing board regression checks passed.
- Database role tests covered manager/editor denial, direct update denial, new editor/new channel, both scopes, stale total/missing channel rollback, duplicate prevention, ledger tamper prevention and resulting balance. All test rows rolled back.
- Storage policy tests covered owner upload, unshared denial, invited viewer read-only and anonymous denial. Test metadata rolled back.
- DOM tests covered k notation, exact detail amounts, dynamically generated channel routes, scope isolation, original File identity passed to upload and download visibility for viewers.
- Supabase advisor review introduced no new warnings. Existing unrelated notices are documented by the provider: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable . Existing share-token RPC intentionally permits anonymous execution.
