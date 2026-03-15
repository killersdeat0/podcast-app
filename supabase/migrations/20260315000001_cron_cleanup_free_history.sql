-- Enable pg_cron extension
create extension if not exists pg_cron with schema pg_catalog;

-- Grant usage to postgres role (required by Supabase)
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Schedule nightly cleanup at 03:00 UTC:
-- Delete playback_progress rows older than 30 days for all free-tier users.
-- Covers both always-free users and lapsed paid users (downgraded to free via Stripe webhook).
select cron.schedule(
  'cleanup-free-user-history',
  '0 3 * * *',
  $$
    delete from playback_progress
    where user_id in (
      select user_id from user_profiles where tier = 'free'
    )
    and updated_at < now() - interval '30 days';
  $$
);
