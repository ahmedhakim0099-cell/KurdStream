/*
# Add proper unique constraint for subtitles upsert

The previous unique index used COALESCE which doesn't work with ON CONFLICT upserts.
Adding a standard UNIQUE constraint on the same columns so the edge function's
upsert with onConflict works correctly.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_unique_upsert
  ON subtitles(tmdb_id, media_type, season_number, episode_number);
