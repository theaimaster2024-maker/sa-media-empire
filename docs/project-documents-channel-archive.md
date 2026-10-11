# Project documents and channel management

Released October 11, 2026. Additive database change; no existing channel, project, transaction, or instructions content is rewritten.

## Channels

Finance > Channels has Active and Archived / Inactive lists. Owner options: edit name, description, platform, initials, subscribers, brand color, monetization; archive; restore; delete empty channel. Dashboard cards show active channels. All financial totals still include archived-channel records. Existing transaction edit forms retain archived channels to preserve historical associations. New-entry channel lists default to active channels.

Empty deletion uses `delete_empty_finance_channel` (security invoker, owner check). It locks the channel and checks income, expenses, payroll, subscriptions, and upload project references before deleting. Existing foreign keys are unchanged. No channel was renamed or archived as part of deployment.

## Project instructions

Open an Editor project > Script / Instructions. Owner/Manager edit; the assigned Editor can read and download original images. All other editors are denied by explicit RLS, including private Storage reads.

The document supports paragraph/headings, fonts/sizes, bold/italic/underline, lists, text/highlight colors, alignment, links, undo/redo. Media blocks below the text support YouTube and Drive audio/video previews, reordering, removal, and original image uploads/downloads. Drive permissions remain controlled by Google Drive. Supported original images: PNG, JPEG, WebP, GIF, AVIF, BMP, up to 20 MB each. Files are uploaded directly without canvas resizing or recompression to private `project-originals`; signed display URLs are generated at runtime and authenticated downloads return the original blob.

`project_documents` stores content, assets, version, timestamp per project. The initial document displays legacy plain instructions if no saved rich document exists. Existing instructions/script links and video/review workflows are preserved. Once a document exists, edit it in Script / Instructions, rather than the project metadata dialog.

Autosave uses a 900ms debounce, version comparison, retry on transient failure, manual Save/Ctrl+S, and a close-page warning for pending changes/uploads. Conflicting versions stop overwrite and retain edits in the open tab. Copy text before reloading on conflict. Unsaved drafts do not survive forced browser closure. Removing an image block does not physically delete its stored original.

## Verification

- JS syntax: main inline script and both new JS modules.
- DOM tests: legacy brief, HTML/link sanitization, allowed embeds, save/version, editor read-only, active/archive filtering, archived financial totals, navigation handlers.
- Database rollback tests: owner create, manager edit, assigned editor read but not write/upload, unrelated editor cannot read document/image, empty deletion, linked-channel delete refusal.
- Security advisors: no newly introduced warnings; existing unrelated findings unchanged.
- Production counts before and after schema change: 3 channels, 5 projects, 12 finance expenses. No production test records retained.
