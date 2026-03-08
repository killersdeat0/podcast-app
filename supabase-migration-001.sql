-- Migration 001: add artwork_url + podcast_title to episodes, collection_id to subscriptions

alter table public.episodes
  add column if not exists artwork_url text,
  add column if not exists podcast_title text;

alter table public.subscriptions
  add column if not exists collection_id text;
