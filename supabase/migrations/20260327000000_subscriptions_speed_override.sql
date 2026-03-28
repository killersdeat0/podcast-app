alter table subscriptions
  add column if not exists speed_override float null;
