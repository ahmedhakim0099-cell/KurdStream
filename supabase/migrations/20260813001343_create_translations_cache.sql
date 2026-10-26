/*
# Create translations cache table

1. New Tables
- `translations`
  - `id` (uuid, primary key)
  - `source_text` (text, the original English synopsis — hashed for dedup via unique index)
  - `source_hash` (text, SHA256 of source_text for fast dedup lookups)
  - `target_lang` (text, default 'ku' for Sorani Kurdish)
  - `translated_text` (text, the AI-translated cinematic Kurdish text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Indexes
- Unique index on (source_hash, target_lang) so repeated requests for the same
  synopsis return the cached translation instead of calling the AI again.

3. Security
- Enable RLS on `translations`.
- This is a no-auth public app: allow anon + authenticated to read (so the
  frontend can fetch cached translations) and insert (so the edge function
  proxy can write new translations). Updates are not needed from the client.
*/

CREATE TABLE IF NOT EXISTS translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text text NOT NULL,
  source_hash text NOT NULL,
  target_lang text NOT NULL DEFAULT 'ku',
  translated_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS translations_hash_lang_idx
  ON translations (source_hash, target_lang);

ALTER TABLE translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_translations" ON translations;
CREATE POLICY "anon_read_translations" ON translations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_translations" ON translations;
CREATE POLICY "anon_insert_translations" ON translations FOR INSERT
  TO anon, authenticated WITH CHECK (true);
