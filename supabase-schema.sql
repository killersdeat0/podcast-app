-- Run this in your Supabase SQL editor to set up the database schema

-- User profiles (extends Supabase auth.users)
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'paid')),
  stripe_customer_id text,
  created_at timestamptz default now()
);

-- Podcast subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_url text not null,
  title text not null,
  artwork_url text,
  subscribed_at timestamptz default now(),
  unique(user_id, feed_url)
);

-- Episode cache (shared across users)
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  feed_url text not null,
  guid text not null,
  title text not null,
  audio_url text not null,
  duration integer,
  pub_date timestamptz,
  description text,
  chapter_url text,
  unique(feed_url, guid)
);

-- Playback progress (per user, per episode)
create table public.playback_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_guid text not null,
  feed_url text not null,
  position_seconds integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz default now(),
  unique(user_id, episode_guid)
);

-- Queue (ordered list of episodes per user)
create table public.queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_guid text not null,
  feed_url text not null,
  position integer not null,
  added_at timestamptz default now(),
  unique(user_id, episode_guid)
);

-- Favorites
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_guid text not null,
  feed_url text not null,
  added_at timestamptz default now(),
  unique(user_id, episode_guid)
);

-- Downloads (tracks offline downloads per user)
create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_guid text not null,
  feed_url text not null,
  stored_url text,
  downloaded_at timestamptz default now(),
  unique(user_id, episode_guid)
);

-- Enable Row Level Security on all tables
alter table public.user_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.episodes enable row level security;
alter table public.playback_progress enable row level security;
alter table public.queue enable row level security;
alter table public.favorites enable row level security;
alter table public.downloads enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users can manage their own profile" on public.user_profiles
  for all using (auth.uid() = user_id);

create policy "Users can manage their own subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id);

create policy "Episodes are readable by authenticated users" on public.episodes
  for select using (auth.role() = 'authenticated');

create policy "Episodes can be inserted by authenticated users" on public.episodes
  for insert with check (auth.role() = 'authenticated');

create policy "Users can manage their own progress" on public.playback_progress
  for all using (auth.uid() = user_id);

create policy "Users can manage their own queue" on public.queue
  for all using (auth.uid() = user_id);

create policy "Users can manage their own favorites" on public.favorites
  for all using (auth.uid() = user_id);

create policy "Users can manage their own downloads" on public.downloads
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
