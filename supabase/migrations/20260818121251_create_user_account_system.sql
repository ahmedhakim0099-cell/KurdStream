/*
# User Account System: Profiles, Lists, Episode Progress, Watch Progress

## Overview
Creates the full user account data model for Kurd Stream:
- User profiles with avatar URL and bio
- User lists (watched / favorites / watch-later) for movies and series
- Episode-level watched status with auto-backfill logic
- Watch progress tracking (resume playback + total watch time stats)

## New Tables

### 1. user_profiles
- `id` (uuid, PK, FK → auth.users, ON DELETE CASCADE)
- `username` (text, unique, display name)
- `avatar_url` (text, nullable — profile picture URL)
- `bio` (text, nullable — user bio/caption)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. user_lists
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, default auth.uid())
- `tmdb_id` (integer — TMDB movie/series ID)
- `media_type` (text — 'movie' or 'tv')
- `list_type` (text — 'watched', 'favorites', 'watch_later')
- `title` (text — cached display title)
- `poster_path` (text — cached poster path)
- `created_at` (timestamptz, default now())
- Unique constraint on (user_id, tmdb_id, media_type, list_type)

### 3. episode_progress
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, default auth.uid())
- `tmdb_id` (integer — TMDB series ID)
- `season_number` (integer)
- `episode_number` (integer)
- `watched` (boolean, default false)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())
- Unique constraint on (user_id, tmdb_id, season_number, episode_number)

### 4. watch_progress
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users, default auth.uid())
- `tmdb_id` (integer — TMDB movie/series ID)
- `media_type` (text — 'movie' or 'tv')
- `season_number` (integer, nullable — for episodes)
- `episode_number` (integer, nullable — for episodes)
- `resume_position` (double precision — seconds, resume position)
- `duration` (double precision — seconds, total video length)
- `title` (text — cached display title)
- `poster_path` (text — cached poster/backdrop path)
- `backdrop_path` (text, nullable)
- `updated_at` (timestamptz, default now())
- Unique constraint on (user_id, tmdb_id, media_type, season_number, episode_number)

## Security
- RLS enabled on all four tables.
- All policies scope to `authenticated` with `auth.uid() = user_id` ownership checks.
- Owner columns default to `auth.uid()` so frontend inserts that omit user_id succeed.
- 4 separate policies per table (SELECT/INSERT/UPDATE/DELETE).

## Notes
1. All tables use `user_id uuid NOT NULL DEFAULT auth.uid()` so the frontend can insert without explicitly passing user_id.
2. Unique constraints prevent duplicate list entries and duplicate progress rows.
3. The `episode_progress` table supports the smart auto-backfill: when a user marks episode N as watched, the frontend marks episodes 1..N-1 as watched too.
4. The `watch_progress` table powers both the "Continue Watching" slider and the total watch time statistics.
*/

-- ── user_profiles ──
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;
CREATE POLICY "select_own_profile" ON user_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
CREATE POLICY "insert_own_profile" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON user_profiles;
CREATE POLICY "delete_own_profile" ON user_profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ── user_lists ──
CREATE TABLE IF NOT EXISTS user_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie','tv')),
  list_type text NOT NULL CHECK (list_type IN ('watched','favorites','watch_later')),
  title text NOT NULL DEFAULT '',
  poster_path text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tmdb_id, media_type, list_type)
);

ALTER TABLE user_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_lists" ON user_lists;
CREATE POLICY "select_own_lists" ON user_lists FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_lists" ON user_lists;
CREATE POLICY "insert_own_lists" ON user_lists FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_lists" ON user_lists;
CREATE POLICY "update_own_lists" ON user_lists FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_lists" ON user_lists;
CREATE POLICY "delete_own_lists" ON user_lists FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_lists_type ON user_lists(user_id, list_type);

-- ── episode_progress ──
CREATE TABLE IF NOT EXISTS episode_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  season_number integer NOT NULL DEFAULT 1,
  episode_number integer NOT NULL DEFAULT 1,
  watched boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tmdb_id, season_number, episode_number)
);

ALTER TABLE episode_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_episodes" ON episode_progress;
CREATE POLICY "select_own_episodes" ON episode_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_episodes" ON episode_progress;
CREATE POLICY "insert_own_episodes" ON episode_progress FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_episodes" ON episode_progress;
CREATE POLICY "update_own_episodes" ON episode_progress FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_episodes" ON episode_progress;
CREATE POLICY "delete_own_episodes" ON episode_progress FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_episode_progress_user ON episode_progress(user_id, tmdb_id);

-- ── watch_progress ──
CREATE TABLE IF NOT EXISTS watch_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie','tv')),
  season_number integer,
  episode_number integer,
  resume_position double precision NOT NULL DEFAULT 0,
  duration double precision NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  poster_path text NOT NULL DEFAULT '',
  backdrop_path text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number)
);

ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_watch_progress" ON watch_progress;
CREATE POLICY "select_own_watch_progress" ON watch_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_watch_progress" ON watch_progress;
CREATE POLICY "insert_own_watch_progress" ON watch_progress FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_watch_progress" ON watch_progress;
CREATE POLICY "update_own_watch_progress" ON watch_progress FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_watch_progress" ON watch_progress;
CREATE POLICY "delete_own_watch_progress" ON watch_progress FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id);
