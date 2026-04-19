ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'rose';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_theme_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_theme_check
      CHECK (theme IN ('rose', 'amber', 'sky', 'violet'));
  END IF;
END$$;
