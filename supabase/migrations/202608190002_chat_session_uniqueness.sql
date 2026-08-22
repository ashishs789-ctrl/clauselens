create unique index if not exists chat_sessions_owner_unique
on public.chat_sessions(document_id, owner_user_id)
where owner_user_id is not null;

create unique index if not exists chat_sessions_guest_unique
on public.chat_sessions(document_id, guest_session_id)
where guest_session_id is not null;
