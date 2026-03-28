create or replace function increment_queue_positions(p_user_id uuid)
returns void
language sql
as $$
  update queue
  set position = position + 1
  where user_id = p_user_id;
$$;
