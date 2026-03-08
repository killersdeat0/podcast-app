-- Add stripe_subscription_id to user_profiles
-- (stripe_customer_id was already added in the initial schema)
alter table public.user_profiles
  add column if not exists stripe_subscription_id text;
