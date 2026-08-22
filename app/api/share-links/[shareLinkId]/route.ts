import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOriginMutation } from "@/lib/security/request";

type RouteContext = { params: Promise<{ shareLinkId: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const { shareLinkId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(shareLinkId)) return errorResponse("Invalid share link.", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Authentication required.", 401);

  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareLinkId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return errorResponse("Could not revoke this link.", 500);
  if (!data) return errorResponse("Active share link not found.", 404);
  return NextResponse.json({ revoked: true });
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
