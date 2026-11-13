-- Traccia gli invii automatici per evitare notifiche duplicate.
create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint push_notification_deliveries_user_event_unique unique (user_id, event_key)
);

create index if not exists push_notification_deliveries_user_id_idx
  on public.push_notification_deliveries(user_id);

alter table public.push_notification_deliveries enable row level security;
revoke all on public.push_notification_deliveries from anon, authenticated;
grant all on public.push_notification_deliveries to service_role;
