import "server-only";

import { cookies } from "next/headers";
import { hashToken, isPlausibleToken } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export const GUEST_COOKIE = "cl_guest_session";

export async function resolveShareLink(rawToken: string) {
  if (!isPlausibleToken(rawToken)) return null;
  const admin = createAdminClient();
  const { data: shareLink } = await admin
    .from("share_links")
    .select("id, document_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!shareLink || shareLink.revoked_at || isExpired(shareLink.expires_at)) return null;
  return shareLink;
}

export async function resolveGuestSession(expectedDocumentId?: string) {
  const rawSessionToken = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!rawSessionToken || !isPlausibleToken(rawSessionToken)) return null;

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from("guest_sessions")
    .select("id, share_link_id, display_name, expires_at")
    .eq("session_token_hash", hashToken(rawSessionToken))
    .maybeSingle();
  if (!guest || isExpired(guest.expires_at)) return null;

  const { data: shareLink } = await admin
    .from("share_links")
    .select("id, document_id, expires_at, revoked_at")
    .eq("id", guest.share_link_id)
    .maybeSingle();
  if (!shareLink || shareLink.revoked_at || isExpired(shareLink.expires_at)) return null;
  if (expectedDocumentId && shareLink.document_id !== expectedDocumentId) return null;

  return { guest, shareLink };
}

function isExpired(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}
