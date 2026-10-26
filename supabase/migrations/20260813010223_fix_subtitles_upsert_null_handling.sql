/*
# Fix subtitles upsert: NULL-safe unique constraint

The previous unique index on (tmdb_id, media_type, season_number, episode_number)
does not work for NULL values — Postgres treats NULL as distinct, so two rows
with season_number=NULL are NOT considered duplicates. This means movie subtitles
(where season/episode are NULL) get "duplicate key" errors instead of upserting.

Solution: drop the broken index and recreate it with COALESCE to normalize NULLs
to -1, so the uniqueness check works for both movies and TV episodes.
*/

DROP INDEX IF EXISTS idx_subtitles_unique_upsert;
DROP INDEX IF EXISTS idx_subtitles_unique;

CREATE UNIQUE INDEX idx_subtitles_unique
  ON subtitles(tmdb_id, media_type, COALESCE(season_number, -1), COALESCE(episode_number, -1));
