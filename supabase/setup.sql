insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'surprise-photos',
  'surprise-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reaction-clips',
  'reaction-clips',
  false,
  26214400,
  array['video/webm', 'video/mp4', 'video/ogg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.reaction_clips (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('video/webm', 'video/mp4', 'video/ogg')),
  created_at timestamptz not null default now(),
  constraint reaction_clips_storage_path_check
    check (storage_path ~ '^incoming/[0-9a-f-]+[.](webm|mp4|ogg)$')
);

alter table public.reaction_clips enable row level security;
grant select, delete on table public.reaction_clips to authenticated;

drop policy if exists "Visitors can register reaction clips" on public.reaction_clips;

create or replace function public.register_reaction_clip(
  p_storage_path text,
  p_mime_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clip_id uuid;
begin
  if p_storage_path !~ '^incoming/[0-9a-f-]+[.](webm|mp4|ogg)$'
     or p_mime_type not in ('video/webm', 'video/mp4', 'video/ogg') then
    raise exception 'Invalid reaction clip details.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'reaction-clips'
      and name = p_storage_path
      and metadata ->> 'mimetype' = p_mime_type
  ) then
    raise exception 'Reaction clip upload was not found.';
  end if;

  insert into public.reaction_clips (storage_path, mime_type)
  values (p_storage_path, p_mime_type)
  returning id into clip_id;

  return clip_id;
end;
$$;

revoke all on function public.register_reaction_clip(text, text) from public;
grant execute on function public.register_reaction_clip(text, text) to anon, authenticated;

drop policy if exists "Admins can view reaction clips" on public.reaction_clips;
create policy "Admins can view reaction clips"
on public.reaction_clips
for select
to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can delete reaction clips" on public.reaction_clips;
create policy "Admins can delete reaction clips"
on public.reaction_clips
for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "Visitors can list surprise photos" on storage.objects;
create policy "Visitors can list surprise photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'surprise-photos');

drop policy if exists "Admins can upload surprise photos" on storage.objects;
create policy "Admins can upload surprise photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'surprise-photos'
  and (select public.is_admin())
);

drop policy if exists "Admins can update surprise photos" on storage.objects;
create policy "Admins can update surprise photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'surprise-photos'
  and (select public.is_admin())
)
with check (
  bucket_id = 'surprise-photos'
  and (select public.is_admin())
);

drop policy if exists "Admins can delete surprise photos" on storage.objects;
create policy "Admins can delete surprise photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'surprise-photos'
  and (select public.is_admin())
);

drop policy if exists "Visitors can upload reaction clips" on storage.objects;
create policy "Visitors can upload reaction clips"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'reaction-clips'
  and name ~ '^incoming/[0-9a-f-]+[.](webm|mp4|ogg)$'
);

drop policy if exists "Admins can view reaction clips" on storage.objects;
create policy "Admins can view reaction clips"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'reaction-clips'
  and (select public.is_admin())
);

drop policy if exists "Admins can delete reaction clips" on storage.objects;
create policy "Admins can delete reaction clips"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'reaction-clips'
  and (select public.is_admin())
);
