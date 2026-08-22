create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.document_processing_status as enum (
  'uploaded',
  'extracting',
  'summarizing',
  'ready',
  'failed'
);

create type public.chat_message_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null check (size_bytes > 0),
  page_count integer check (page_count > 0),
  summary text,
  processing_status public.document_processing_status not null default 'uploaded',
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_owner_created_idx on public.documents(owner_id, created_at desc);
create index documents_owner_filename_idx on public.documents(owner_id, lower(original_filename));

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  content text not null,
  token_count integer not null check (token_count > 0),
  embedding extensions.vector(768),
  unique (document_id, chunk_index)
);

create index document_chunks_document_idx on public.document_chunks(document_id, chunk_index);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index share_links_document_idx on public.share_links(document_id, created_at desc);

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index guest_sessions_share_link_idx on public.guest_sessions(share_link_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete cascade,
  author_guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_exactly_one_author check (
    (author_user_id is not null and author_guest_session_id is null)
    or (author_user_id is null and author_guest_session_id is not null)
  )
);

create index comments_document_created_idx on public.comments(document_id, created_at);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_sessions_exactly_one_owner check (
    (owner_user_id is not null and guest_session_id is null)
    or (owner_user_id is null and guest_session_id is not null)
  )
);

create index chat_sessions_document_idx on public.chat_sessions(document_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role public.chat_message_role not null,
  content text not null check (char_length(content) between 1 and 20000),
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_session_created_idx on public.chat_messages(chat_session_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();
create trigger comments_set_updated_at before update on public.comments
for each row execute function public.set_updated_at();
create trigger chat_sessions_set_updated_at before update on public.chat_sessions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_document_id uuid,
  match_count integer default 6
)
returns table (
  id bigint,
  content text,
  page_start integer,
  page_end integer,
  similarity double precision
)
language sql stable set search_path = '' as $$
  select
    chunks.id,
    chunks.content,
    chunks.page_start,
    chunks.page_end,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from public.document_chunks as chunks
  where chunks.document_id = match_document_id
    and chunks.embedding is not null
  order by chunks.embedding <=> query_embedding
  limit greatest(1, least(match_count, 12));
$$;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.share_links enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.comments enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles_select_self" on public.profiles
for select using ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles
for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "documents_owner_all" on public.documents
for all using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "chunks_owner_select" on public.document_chunks
for select using (exists (
  select 1 from public.documents
  where documents.id = document_chunks.document_id
    and documents.owner_id = (select auth.uid())
));

create policy "share_links_owner_all" on public.share_links
for all using (exists (
  select 1 from public.documents
  where documents.id = share_links.document_id
    and documents.owner_id = (select auth.uid())
)) with check (created_by = (select auth.uid()) and exists (
  select 1 from public.documents
  where documents.id = share_links.document_id
    and documents.owner_id = (select auth.uid())
));

create policy "comments_owner_select" on public.comments
for select using (exists (
  select 1 from public.documents
  where documents.id = comments.document_id
    and documents.owner_id = (select auth.uid())
));
create policy "comments_owner_insert" on public.comments
for insert with check (
  author_user_id = (select auth.uid())
  and author_guest_session_id is null
  and exists (
    select 1 from public.documents
    where documents.id = comments.document_id
      and documents.owner_id = (select auth.uid())
  )
);

create policy "chat_sessions_owner_all" on public.chat_sessions
for all using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()) and guest_session_id is null);

create policy "chat_messages_owner_select" on public.chat_messages
for select using (exists (
  select 1 from public.chat_sessions
  where chat_sessions.id = chat_messages.chat_session_id
    and chat_sessions.owner_user_id = (select auth.uid())
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "pdf_owner_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "pdf_owner_select" on storage.objects
for select to authenticated using (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "pdf_owner_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
