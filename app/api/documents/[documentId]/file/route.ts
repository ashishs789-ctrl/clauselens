import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { documentId } = await params;
  if (!isUuid(documentId)) return errorResponse("Invalid document identifier.", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Authentication required.", 401);

  const { data: document } = await supabase
    .from("documents")
    .select("storage_path, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return errorResponse("Document not found.", 404);

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from("pdfs").download(document.storage_path);
  if (error || !file) return errorResponse("PDF could not be loaded.", 502);

  const download = request.nextUrl.searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeRFC5987(document.original_filename)}`;
  return new Response(file.stream(), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(file.size),
      "content-disposition": disposition,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function encodeRFC5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
