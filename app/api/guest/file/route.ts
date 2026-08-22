import { NextResponse, type NextRequest } from "next/server";
import { resolveGuestSession } from "@/lib/sharing/access";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return errorResponse("Invalid document identifier.", 400);

  const access = await resolveGuestSession(documentId);
  if (!access) return errorResponse("Guest access is invalid or has expired.", 401);

  const admin = createAdminClient();
  const { data: document } = await admin
    .from("documents")
    .select("storage_path, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return errorResponse("Document not found.", 404);

  const { data: file, error } = await admin.storage.from("pdfs").download(document.storage_path);
  if (error || !file) return errorResponse("PDF could not be loaded.", 502);

  const download = request.nextUrl.searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeRFC5987(document.original_filename)}`;
  return new Response(file.stream(), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(file.size),
      "content-disposition": disposition,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

function encodeRFC5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
