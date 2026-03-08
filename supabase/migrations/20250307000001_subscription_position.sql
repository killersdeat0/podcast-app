alter table public.subscriptions
  add column if not exists position integer not null default 0;

-- Initialize positions based on subscribed_at order
update public.subscriptions s
set position = sub.row_num
from (
  select id, row_number() over (partition by user_id order by subscribed_at asc) - 1 as row_num
  from public.subscriptions
) sub
where s.id = sub.id;
