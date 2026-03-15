alter table public.subscriptions
  add column if not exists last_feed_checked_at timestamptz;
