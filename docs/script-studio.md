# Script Studio

The Script Board tab embeds `board.html`; styles and JavaScript are isolated in `board/`. Other app modules are unchanged. The previous release is preserved on `backup-before-script-studio-20260928`.

## Use

Owners/managers create projects and share access. Click New project for a blank canvas or connected storyboard. Add cards with the left toolbar, double-click their text to edit, and drag a connection dot to another card. Select text to apply bold/italic/highlighting. Select a card to change color, duplicate, or delete. YouTube and Google Drive URLs can be embedded; Drive's own permissions still apply. Uploaded images are resized to fit the board's storage limits.

Changes save after a short pause. Wait for “All changes saved” before closing. A failed save is retried; a device-local draft is retained when browser storage permits. Do not clear browser storage while a draft is unsaved. Projects and board items are stored in Supabase, not only in the browser.

Share supports signed-in team members with view/edit access and revocable public view-only links. Owners/managers always have access. Public links never enable editing. Board membership is enforced by RLS. The public RPC returns only the board title and content for a matching random token.

Other sessions refresh every 30 seconds while visible and idle. Different cards save independently; simultaneous edits to the same card use the latest successful write. This is not a CRDT/live-cursor implementation. Hosting/database provider quotas still apply; no paid whiteboard service is required.

## Verification (2026-09-28)

- Main app and board JavaScript syntax checked.
- DOM harness: creation, connector tracking, cascading deletion/undo, autosave, offline draft retention, in-flight edits, HTML sanitization, embedding and read-only enforcement passed.
- Database transaction tests using authenticated and anonymous roles: private board isolation, invited view/edit access, owner sharing controls, public token lookup and revocation passed; QA rows rolled back.
- Live GitHub Pages public preview rendered cards and connectors, and zoom worked. No application errors in inspected browser log.
- Authenticated owner editing UI was not exercised in the cloud browser; DOM logic and database permissions were tested separately.
- Supabase advisor flags intentional anonymous SECURITY DEFINER execution for the token-gated read-only RPC. See https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable . Existing unrelated advisories were not modified.

## Database

The applied schema is recorded in `supabase/migrations/20260928040000_studio_boards.sql`. It creates only board-specific tables/functions/policies. Do not re-run it against the already-migrated production project. Supabase migration history is authoritative for applied versions.
