-- Drop the nightly free-user history cleanup cron.
-- The 30-day free-tier limit is now enforced at query time in the history and
-- stats APIs. Deleting playback_progress rows breaks episodes_completed
-- double-count prevention (which relies on reading the previous completed value)
-- and silently un-marks episodes as played on the podcast detail page.
select cron.unschedule('cleanup-free-user-history');
