create extension if not exists pgcrypto;
create table public.didido_profiles (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, name text not null check (char_length(name) between 1 and 80), created_at timestamptz not null default now());
create table public.didido_tasks (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.didido_profiles(id) on delete cascade, title text not null check (char_length(title) between 1 and 100), icon text not null default '✓' check (char_length(icon) between 1 and 8), done boolean not null default false, done_at timestamptz, created_at timestamptz not null default now());
alter table public.didido_profiles enable row level security;
alter table public.didido_tasks enable row level security;
create policy "didido owners manage profiles" on public.didido_profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "didido owners manage tasks" on public.didido_tasks for all using (exists (select 1 from public.didido_profiles p where p.id = didido_tasks.profile_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.didido_profiles p where p.id = didido_tasks.profile_id and p.owner_id = auth.uid()));
create or replace function public.didido_create_initial_profile() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.didido_profiles (owner_id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'username', 'Мой профиль')); return new; end; $$;
create trigger didido_on_auth_user_created after insert on auth.users for each row execute procedure public.didido_create_initial_profile();
