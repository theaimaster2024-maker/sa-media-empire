# Owner-only Private Notes

The existing Notes workspace remains available to owner and manager. A separate
Private Notes navigation item opens a document-style rich editor for the owner.
Its content is stored only in owner_private_documents; the policy requires both
owner role and owner_id = auth.uid() for every read/write. No existing note is copied
or reclassified, and no new private content is exposed to managers or editors.

Features: headings, bold/italic/underline/strike, bullets, numbered lists, text color,
highlight, alignment, undo/redo, clear formatting, word count, manual Save/Ctrl+S
and debounced autosave. Sanitization removes scripts, embeds, event handlers and
unapproved formatting. Concurrent edits use a version condition; conflicts keep the
current text and stop auto-overwriting. Unsent edits trigger a leave-page warning.
No note content is copied into browser localStorage.

Verification: owner insert/update and manager/editor denial under authenticated
roles inside a rolled-back transaction; DOM tests for content sanitization, load,
formatted save, version updates and status; main and editor JavaScript syntax.
