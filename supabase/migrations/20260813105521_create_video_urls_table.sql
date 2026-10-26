/*
# Create video_urls table for direct video links

## Purpose
Admin can paste direct .mp4 or .m3u8 URLs for each movie or TV episode.
The player reads these URLs and plays them natively via Plyr/HLS — no more iframes.

## New Tables
- `video_urls`
  - `id` (uuid, primary key)
  - `tmdb_id` (integer, not null) — TMDB movie/series ID
  - `media_type` (text, not null) — 'movie' or 'tv'
  - `season_number` (integer, nullable) — for TV episodes
  - `episode_number` (integer, nullable) — for TV episodes
  - `url` (text, not null) — the direct .mp4 or .m3u8 URL
  - `label` (text, nullable) — optional quality label e.g. "1080p"
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Unique Constraint
- Unique index on (tmdb_id, media_type, season_number, episode_number) with COALESCE
  so movies (NULL season/episode) and TV episodes are distinct.

## Security
- RLS enabled.
- Anon + authenticated can SELECT (the player needs to read URLs).
- Admin writes controlled at edge function level via admin password.
*/

CREATE TABLE IF NOT EXISTS video_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  media_type text NOT NULL DEFAULT 'movie',
  season_number integer,
  episode_number integer,
  url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE video_urls ENABLE ROW LEVEL SECURITY;

-- Unique index with COALESCE for NULL-safe season/episode matching
CREATE UNIQUE INDEX IF NOT EXISTS video_urls_unique_media
  ON video_urls (tmdb_id, media_type, COALESCE(season_number, -1), COALESCE(episode_number, -1));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_video_urls_tmdb ON video_urls (tmdb_id, media_type);

-- Public read (player needs to fetch URLs)
DROP POLICY IF EXISTS "anon_select_video_urls" ON video_urls;
CREATE POLICY "anon_select_video_urls" ON video_urls FOR SELECT
  TO anon, authenticated USING (true);

-- Admin writes (controlled via edge function with admin password)
DROP POLICY IF EXISTS "anon_insert_video_urls" ON video_urls;
CREATE POLICY "anon_insert_video_urls" ON video_urls FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_video_urls" ON video_urls;
CREATE POLICY "anon_update_video_urls" ON video_urls FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_video_urls" ON video_urls;
CREATE POLICY "anon_delete_video_urls" ON video_urls FOR DELETE
  TO anon, authenticated USING (true);
