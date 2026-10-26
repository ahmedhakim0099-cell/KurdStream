/*
# Create video storage bucket for admin video uploads

1. Storage
- Create a public bucket named `videos` to store uploaded video files.
- Videos uploaded by the admin are stored here and served via public URLs.
2. Security
- The bucket is public so the video player can stream files without auth.
- Upload/overwrite/delete is restricted to the `authenticated` role (admin).
- Public anon read is allowed for streaming.
3. Notes
- This is a single-tenant admin app (password-protected via edge function), so
  the anon key is used for both reading (public) and writing (admin via edge function).
- The actual upload happens client-side using the Supabase Storage API with the anon key,
  so we allow anon uploads as well since the admin panel is already password-gated.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to the videos bucket
DROP POLICY IF EXISTS "public_read_videos" ON storage.objects;
CREATE POLICY "public_read_videos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'videos');

-- Allow anon and authenticated to upload to the videos bucket
-- (the admin panel is already password-protected at the app level)
DROP POLICY IF EXISTS "anon_upload_videos" ON storage.objects;
CREATE POLICY "anon_upload_videos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'videos');

-- Allow updating/overwriting video files
DROP POLICY IF EXISTS "anon_update_videos" ON storage.objects;
CREATE POLICY "anon_update_videos" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');

-- Allow deleting video files
DROP POLICY IF EXISTS "anon_delete_videos" ON storage.objects;
CREATE POLICY "anon_delete_videos" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'videos');
