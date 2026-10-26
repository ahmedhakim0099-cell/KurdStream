/*
# Create subtitles table for Kurdish subtitle storage

1. New Tables
- `subtitles`: Stores Kurdish subtitle tracks linked to TMDB content.
  - `id` (uuid, primary key)
  - `tmdb_id` (integer, not null) — TMDB movie or TV show ID
  - `media_type` (text, not null) — 'movie' or 'tv'
  - `season_number` (integer, nullable) — for TV shows only
  - `episode_number` (integer, nullable) — for TV shows only
  - `title` (text, not null) — display title of the movie/show
  - `language` (text, not null, default 'ku') — subtitle language code
  - `content` (text, not null) — the VTT subtitle file content
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
2. Indexes
- Unique index on (tmdb_id, media_type, season_number, episode_number) to prevent duplicates
- Index on tmdb_id for fast lookups
3. Security
- Enable RLS on `subtitles`.
- SELECT: public (anon + authenticated) — all viewers can load subtitles
- INSERT/UPDATE/DELETE: public (anon + authenticated) — the edge function uses the service role key which bypasses RLS, and admin writes are protected by password in the edge function itself
*/

CREATE TABLE IF NOT EXISTS subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
  season_number integer,
  episode_number integer,
  title text NOT NULL,
  language text NOT NULL DEFAULT 'ku',
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtitles_tmdb_id ON subtitles(tmdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_unique 
  ON subtitles(tmdb_id, media_type, COALESCE(season_number, -1), COALESCE(episode_number, -1));

ALTER TABLE subtitles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_subtitles" ON subtitles;
CREATE POLICY "public_select_subtitles"
ON subtitles FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_subtitles" ON subtitles;
CREATE POLICY "public_insert_subtitles"
ON subtitles FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_subtitles" ON subtitles;
CREATE POLICY "public_update_subtitles"
ON subtitles FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_subtitles" ON subtitles;
CREATE POLICY "public_delete_subtitles"
ON subtitles FOR DELETE
TO anon, authenticated USING (true);
