alter table user_profiles
  add column if not exists skip_back_seconds integer null,
  add column if not exists skip_forward_seconds integer null;
