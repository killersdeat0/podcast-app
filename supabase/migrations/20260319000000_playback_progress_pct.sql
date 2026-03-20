alter table playback_progress
  add column if not exists position_pct smallint;
