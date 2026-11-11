-- SUNSET FIDELITY: subscription Web Push per singolo dispositivo.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%')
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "push subscriptions read own" on public.push_subscriptions;
create policy "push subscriptions read own"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
