create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade unique,
  name text not null default 'Personal',
  created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon, authenticated;
grant select on public.workspaces to authenticated;
create policy workspace_owner_read on public.workspaces
  for select to authenticated using (owner_id = (select auth.uid()));

create function public.create_personal_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspaces(owner_id) values (new.id) on conflict (owner_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_personal_workspace() from public;
create trigger create_personal_workspace after insert on auth.users
  for each row execute function public.create_personal_workspace();
insert into public.workspaces(owner_id) select id from auth.users on conflict (owner_id) do nothing;

-- Private assets are added with the asset API, not during identity bootstrap.
