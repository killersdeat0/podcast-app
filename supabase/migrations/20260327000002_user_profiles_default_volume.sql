alter table user_profiles
  add column if not exists default_volume float null;
