-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor)
-- This creates the deleted_items table and adds is_admin to user_profiles

-- 1. Create deleted_items table
CREATE TABLE IF NOT EXISTS deleted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tmdb_id, media_type)
);

ALTER TABLE deleted_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_deleted_items" ON deleted_items;
CREATE POLICY "public_read_deleted_items" ON deleted_items
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "auth_insert_deleted_items" ON deleted_items;
CREATE POLICY "auth_insert_deleted_items" ON deleted_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_deleted_items" ON deleted_items;
CREATE POLICY "auth_delete_deleted_items" ON deleted_items
  FOR DELETE TO authenticated
  USING (true);

-- 2. Add is_admin column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 3. Create a function to check if a user is admin (readable by all)
CREATE OR REPLACE FUNCTION is_user_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM user_profiles WHERE id = check_user_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION is_user_admin(uuid) TO anon, authenticated;

-- 4. Set the hardcoded admin email
UPDATE user_profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'ahmed.hakim0099@gmail.com'
);
