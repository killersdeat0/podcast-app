ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'rose';

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_theme_check
  CHECK (theme IN ('rose', 'amber', 'sky', 'violet'));
