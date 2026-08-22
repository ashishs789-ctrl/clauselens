# ClauseLens

ClauseLens is a secure PDF intelligence and collaboration workspace. Owners can upload private PDFs, receive AI-generated summaries, ask grounded questions, share revocable guest links, and collaborate through comments.

## Current status

The application foundation, database migrations, authentication, protected dashboard, private PDF upload, text extraction, chunk embeddings, AI summaries, owner workspace, revocable guest sharing, shared comments, and grounded streaming PDF chat are complete. Feature implementation is proceeding in the order documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local setup

Prerequisites:

- Node.js 20 or newer
- pnpm 11
- A Supabase project
- A Google Gemini API key

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and replace every placeholder.
3. Apply every SQL file in `supabase/migrations` to the Supabase project in filename order.
4. Start the application with `pnpm dev`.
5. Open `http://localhost:3000`.

Never commit `.env.local`, a Supabase service-role key, or an LLM API key.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Row-level-security-aware public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Privileged processing and guest-access operations |
| `GEMINI_API_KEY` | Server only | Summary, embedding, and document chat requests |
| `GEMINI_GENERATION_MODEL` | Server only | Gemini generation model; defaults to `gemini-3.6-flash` |
| `GEMINI_EMBEDDING_MODEL` | Server only | 768-dimensional embedding model; defaults to `gemini-embedding-2` |
| `NEXT_PUBLIC_APP_URL` | Browser and server | Absolute base URL for generated links |
| `MAX_PDF_SIZE_MB` | Server only | Upload size ceiling |
| `MAX_PDF_PAGES` | Server only | PDF processing page ceiling |

## Quality checks

Run `pnpm check` before submitting. It performs linting, strict TypeScript validation, automated tests, and a production build.

The automated suite currently verifies PDF signature edge cases, renamed non-PDF rejection, text normalization, page-aware chunk construction, oversized-page splitting, and same-origin mutation protection.

## Security baseline

- Every document operation resolves owner or document-scoped guest access on the server.
- All mutating JSON endpoints reject missing or cross-site `Origin` headers.
- PDFs remain in a private bucket and are streamed only after authorization.
- Share and guest-session tokens are cryptographically random, hashed at rest, expiring, and revocable.
- Guest cookies are HTTP-only, SameSite, secure in production, and bounded by share-link expiry.
- Global headers disable MIME sniffing and unnecessary browser capabilities, restrict framing to the same origin, and enable HSTS in production.
- Password handling is delegated to Supabase Auth; service and LLM keys are server-only environment variables.
- Comments are rendered as plain text, API input lengths are bounded, and comment/chat rate limits use durable database queries.
- PDF text is treated as untrusted data inside summary and chat prompts.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model, authorization rules, PDF pipeline, long-document retrieval strategy, route outline, security baseline, and implementation sequence.

## AI summary approach

PDF processing runs only after an authenticated owner uploads to a short-lived signed path in the private `pdfs` bucket. The server verifies the PDF binary signature, extracts page-separated text, normalizes it, and creates overlapping page-aware chunks. Gemini creates 768-dimensional retrieval embeddings for those chunks.

For documents that fit comfortably in one request, the summary prompt receives all extracted text. Longer documents use a map-reduce approach: Gemini first extracts evidence-preserving section notes and then synthesizes those notes into a final 3–5 sentence summary. Prompts treat PDF contents as untrusted data, prohibit invented facts and generic restatements, and request concrete parties, obligations, findings, dates, amounts, risks, and conclusions when present.

Image-only PDFs currently receive a clear failure state because OCR is outside the initial must-have scope.

## Grounded chat approach

Each owner or guest session has a private conversation for a single document. For every question, ClauseLens combines the current question with recent user turns, creates a retrieval-query embedding, and uses pgvector similarity search to select up to eight page-aware chunks from that document only. The generation prompt receives those excerpts, the latest five conversational turns, and strict instructions to avoid outside knowledge, treat PDF text as untrusted data, acknowledge missing evidence, and cite supporting pages.

Responses stream to the browser as newline-delimited events for immediate feedback. The completed assistant answer and retrieved page references are persisted after generation finishes. Chat requests are limited per session, and guest access is revalidated against link expiry and revocation before history or retrieval is available.
