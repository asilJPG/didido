create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists didido_on_auth_user_created on auth.users;
drop function if exists public.create_initial_profile();
drop function if exists public.didido_create_initial_profile() cascade;

drop table if exists public.didido_tasks cascade;
drop table if exists public.didido_profiles cascade;
drop table if exists public.didido_users cascade;

create table public.didido_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (char_length(username) between 3 and 30),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table public.didido_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.didido_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.didido_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.didido_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  icon text not null default '✓' check (char_length(icon) between 1 and 8),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.didido_users enable row level security;
alter table public.didido_profiles enable row level security;
alter table public.didido_tasks enable row level security;

create policy "didido allow all on profiles" on public.didido_profiles for all using (true) with check (true);
create policy "didido allow all on tasks" on public.didido_tasks for all using (true) with check (true);

-- Permissions for Supabase public/anon client
grant usage on schema public to anon, authenticated;
grant all on table public.didido_users to anon, authenticated;
grant all on table public.didido_profiles to anon, authenticated;
grant all on table public.didido_tasks to anon, authenticated;

create or replace function public.didido_create_initial_profile()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.didido_profiles (owner_id, name)
  values (new.id, new.username);
  return new;
end;
$$;

create trigger didido_on_user_created
  after insert on public.didido_users
  for each row execute procedure public.didido_create_initial_profile();

create or replace function public.didido_register(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user public.didido_users%rowtype;
  v_clean_username text;
  v_salt text;
  v_hash text;
begin
  v_clean_username := lower(trim(p_username));
  if char_length(v_clean_username) < 3 or char_length(v_clean_username) > 30 then
    raise exception 'Логин должен быть от 3 до 30 символов';
  end if;
  if char_length(p_password) < 6 then
    raise exception 'Пароль должен быть не менее 6 символов';
  end if;

  -- Support both public and extensions schema for pgcrypto
  begin
    v_salt := extensions.gen_salt('bf');
    v_hash := extensions.crypt(p_password, v_salt);
  exception when undefined_function then
    v_salt := public.gen_salt('bf');
    v_hash := public.crypt(p_password, v_salt);
  end;

  insert into public.didido_users (username, password_hash)
  values (v_clean_username, v_hash)
  returning * into v_user;

  return json_build_object('id', v_user.id, 'username', v_user.username);
exception
  when unique_violation then
    raise exception 'Пользователь с таким логином уже существует';
end;
$$;

create or replace function public.didido_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user public.didido_users%rowtype;
  v_clean_username text;
  v_check_hash text;
begin
  v_clean_username := lower(trim(p_username));
  select * into v_user
  from public.didido_users
  where username = v_clean_username;

  if not found then
    raise exception 'Неверный логин или пароль';
  end if;

  begin
    v_check_hash := extensions.crypt(p_password, v_user.password_hash);
  exception when undefined_function then
    v_check_hash := public.crypt(p_password, v_user.password_hash);
  end;

  if v_user.password_hash != v_check_hash then
    raise exception 'Неверный логин или пароль';
  end if;

  return json_build_object('id', v_user.id, 'username', v_user.username);
end;
$$;

grant execute on function public.didido_register(text, text) to anon, authenticated;
grant execute on function public.didido_login(text, text) to anon, authenticated;
