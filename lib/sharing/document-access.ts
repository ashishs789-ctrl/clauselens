import "server-only";

import { resolveGuestSession } from "@/lib/sharing/access";
import { createClient } from "@/lib/supabase/server";

export type DocumentAccess =
  | { kind: "owner"; documentId: string; userId: string }
  | { kind: "guest"; documentId: string; guestSessionId: string; displayName: string };

export async function resolveDocumentAccess(documentId: string): Promise<DocumentAccess | null> {
  if (!isUuid(documentId)) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: ownedDocument } = await supabase.from("documents").select("id").eq("id", documentId).maybeSingle();
    if (ownedDocument) return { kind: "owner", documentId, userId: user.id };
  }

  const guestAccess = await resolveGuestSession(documentId);
  if (!guestAccess) return null;
  return {
    kind: "guest",
    documentId,
    guestSessionId: guestAccess.guest.id,
    displayName: guestAccess.guest.display_name,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
