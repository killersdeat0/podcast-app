-- Listening stats: daily totals per user
create table public.listening_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  seconds_listened integer not null default 0,
  primary key (user_id, date)
);

-- Listening stats: per-show totals per user
create table public.listening_by_show (
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_url text not null,
  seconds_listened integer not null default 0,
  episodes_completed integer not null default 0,
  last_listened_at timestamptz not null default now(),
  primary key (user_id, feed_url)
);

-- Enable Row Level Security
alter table public.listening_daily enable row level security;
alter table public.listening_by_show enable row level security;

-- RLS Policies
create policy "Users can manage their own listening_daily" on public.listening_daily
  for all using (auth.uid() = user_id);

create policy "Users can manage their own listening_by_show" on public.listening_by_show
  for all using (auth.uid() = user_id);
