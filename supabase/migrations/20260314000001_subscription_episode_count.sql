alter table public.subscriptions
  add column if not exists new_episode_count integer not null default 0;
