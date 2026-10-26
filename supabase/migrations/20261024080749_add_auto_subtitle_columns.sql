/*
# Add auto-translation support columns to subtitles table

1. Modified Tables
- `subtitles`
  - Add `file_url` (text, nullable) — public URL of the VTT file in Storage
  - Add `label` (text, nullable, default NULL) — display label for the subtitle track
  - Add `is_auto` (boolean, not null, default false) — true if this subtitle was auto-translated by the system

2. Security
- No new tables. Existing public RLS policies on `subtitles` already allow anon + authenticated CRUD.
- No changes to grants or policies needed — the new columns inherit the table's existing access rules.

3. Notes
- `file_url` lets the player load subtitle VTTs directly from Storage without going through the edge function.
- `is_auto` distinguishes auto-translated subtitles from manually uploaded ones in the admin dashboard.
- `label` stores the display name shown in the player's subtitle track menu (e.g. "Kurdish (Auto)").
- All three columns are additive — no existing data is modified or lost.
*/

ALTER TABLE subtitles ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE subtitles ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE subtitles ADD COLUMN IF NOT EXISTS is_auto boolean NOT NULL DEFAULT false;
