-- SUNSET FIDELITY - schema iniziale per un progetto Supabase nuovo
-- Eseguire una sola volta nel SQL Editor. Non inserire qui password o chiavi API.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  display_name text not null default '',
  card_color text not null default 'ember' check (card_color in ('ember','midnight','olive','sand')),
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points <> 0),
  reason text not null default 'Movimento',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  points_cost integer not null check (points_cost > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.loyalty_settings (
  id integer primary key default 1 check (id=1),
  points_per_euro numeric(8,2) not null default 1 check(points_per_euro>=0),
  rounding text not null default 'floor' check(rounding in ('floor','round','ceil')),
  updated_at timestamptz not null default now()
);
insert into public.loyalty_settings(id) values(1) on conflict(id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,email,full_name,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;

alter table public.profiles enable row level security;
alter table public.point_ledger enable row level security;
alter table public.rewards enable row level security;
alter table public.loyalty_settings enable row level security;

drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists "profile update self" on public.profiles;
create policy "profile update self" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role='customer');
drop policy if exists "ledger read self or admin" on public.point_ledger;
create policy "ledger read self or admin" on public.point_ledger for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "rewards read authenticated" on public.rewards;
create policy "rewards read authenticated" on public.rewards for select to authenticated using(active or public.is_admin());
drop policy if exists "rewards admin insert" on public.rewards;
create policy "rewards admin insert" on public.rewards for insert to authenticated with check(public.is_admin());
drop policy if exists "rewards admin update" on public.rewards;
create policy "rewards admin update" on public.rewards for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "settings read authenticated" on public.loyalty_settings;
create policy "settings read authenticated" on public.loyalty_settings for select to authenticated using(true);
drop policy if exists "settings admin update" on public.loyalty_settings;
create policy "settings admin update" on public.loyalty_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());

revoke all on public.point_ledger from anon, authenticated;
grant select on public.point_ledger to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update on public.rewards to authenticated;
grant select,update on public.loyalty_settings to authenticated;
grant usage,select on sequence public.point_ledger_id_seq to authenticated;

create or replace function public.admin_add_points(p_user_id uuid,p_points integer,p_reason text default 'Accredito')
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Operazione riservata all’amministratore'; end if;
 if p_points is null or p_points<1 then raise exception 'Punti non validi'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Cliente non trovato'; end if;
 insert into public.point_ledger(user_id,points,reason,created_by) values(p_user_id,p_points,coalesce(nullif(p_reason,''),'Accredito'),auth.uid());
end $$;
create or replace function public.admin_remove_points(p_user_id uuid,p_points integer,p_reason text default 'Storno')
returns void language plpgsql security definer set search_path=public
as $$
declare current_balance bigint;
begin
 if not public.is_admin() then raise exception 'Operazione riservata all’amministratore'; end if;
 if p_points is null or p_points<1 then raise exception 'Punti non validi'; end if;
 select coalesce(sum(points),0) into current_balance from public.point_ledger where user_id=p_user_id;
 if current_balance<p_points then raise exception 'Saldo punti insufficiente'; end if;
 insert into public.point_ledger(user_id,points,reason,created_by) values(p_user_id,-p_points,coalesce(nullif(p_reason,''),'Storno'),auth.uid());
end $$;
create or replace function public.admin_update_settings(p_points_per_euro numeric,p_rounding text)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Operazione riservata all’amministratore'; end if;
 if p_points_per_euro<0 or p_rounding not in ('floor','round','ceil') then raise exception 'Impostazioni non valide'; end if;
 update public.loyalty_settings set points_per_euro=p_points_per_euro,rounding=p_rounding,updated_at=now() where id=1;
end $$;
revoke all on function public.admin_add_points(uuid,integer,text) from public,anon;
revoke all on function public.admin_remove_points(uuid,integer,text) from public,anon;
revoke all on function public.admin_update_settings(numeric,text) from public,anon;
grant execute on function public.admin_add_points(uuid,integer,text) to authenticated;
grant execute on function public.admin_remove_points(uuid,integer,text) to authenticated;
grant execute on function public.admin_update_settings(numeric,text) to authenticated;

-- Dopo aver creato il tuo account cliente, promuovilo ad admin eseguendo:
-- update public.profiles set role='admin' where email='LA_TUA_EMAIL';
