alter table public.subscriptions
  add column if not exists last_visited_at timestamptz,
  add column if not exists latest_episode_pub_date timestamptz,
  add column if not exists episode_filter text;
