# PDF Intelligence & Collaboration System — Architecture

## 1. Scope and delivery strategy

The first release will optimize for a reliable end-to-end demo of every must-have feature. Optional features will only be added after the core flows pass deployed-environment testing.

Core flows:

1. A user signs up or signs in.
2. The user uploads a validated PDF.
3. The application extracts text, divides it into page-aware chunks, and generates a concise summary.
4. The owner finds the document on a searchable dashboard and opens its workspace.
5. The owner creates a secure, revocable share link.
6. A guest opens the link, supplies a display name, views the PDF, comments, and asks document-grounded questions.
7. Both owner and guest can continue a contextual chat without gaining access to any other document.

## 2. Proposed stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Application | Next.js App Router + TypeScript | One repository for responsive UI, server routes, authentication integration, and deployment |
| UI | Tailwind CSS + accessible component primitives | Fast, consistent responsive implementation without a large custom design system |
| Database | Supabase PostgreSQL | Managed relational database with row-level security and vector support |
| Authentication | Supabase Auth | Secure email/password registration, password hashing, sessions, and future reset flow |
| File storage | Private Supabase Storage bucket | PDFs are never public; short-lived signed URLs are issued only after authorization |
| PDF viewer | PDF.js-based React viewer | Browser-native page rendering without exposing a permanent public file URL |
| PDF extraction | Server-side page-aware PDF parser | Produces text associated with page numbers for retrieval and citations |
| LLM | Server-only provider adapter, initially Google Gemini | Keeps keys private and makes the model replaceable without changing product logic |
| Retrieval | Chunk embeddings stored with `pgvector` | Relevant context can be selected for long documents instead of sending the full PDF |
| Validation | Zod schemas plus file signature checks | Shared, explicit validation at API boundaries |
| Deployment | Vercel for the app; Supabase for data and files | Simple public deployment with managed services |

Exact package and model versions will be pinned during project scaffolding. LLM calls will sit behind an internal interface so a different supported provider can be selected through environment configuration.

## 3. System boundaries

The browser may:

- hold a normal authenticated session;
- hold a document-specific guest share token;
- request upload authorization, document metadata, comments, and chat responses.

The browser may not:

- receive database service credentials or an LLM API key;
- query unrestricted document records;
- receive a permanent public PDF URL;
- choose which document chunks are treated as trusted LLM context.

Server routes validate the user session or share token before every document operation. Database row-level security provides a second layer for owner operations; privileged server access remains isolated to server-only modules.

## 4. Data model

### `profiles`

- `id uuid primary key` — references the authentication user
- `name text not null`
- `email text not null`
- `created_at timestamptz not null`

### `documents`

- `id uuid primary key`
- `owner_id uuid not null`
- `original_filename text not null`
- `storage_path text not null unique`
- `mime_type text not null`
- `size_bytes bigint not null`
- `page_count integer`
- `summary text`
- `processing_status enum` — `uploaded`, `extracting`, `summarizing`, `ready`, `failed`
- `processing_error text` — sanitized failure detail for owner troubleshooting
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `document_chunks`

- `id bigint primary key`
- `document_id uuid not null`
- `chunk_index integer not null`
- `page_start integer not null`
- `page_end integer not null`
- `content text not null`
- `token_count integer not null`
- `embedding vector`
- unique constraint on `(document_id, chunk_index)`

### `share_links`

- `id uuid primary key`
- `document_id uuid not null`
- `token_hash text not null unique`
- `created_by uuid not null`
- `expires_at timestamptz nullable`
- `revoked_at timestamptz nullable`
- `created_at timestamptz not null`

Only a cryptographic hash of the link token is stored. The raw high-entropy token appears in the URL and is shown once to the owner. Revocation invalidates the link immediately.

### `guest_sessions`

- `id uuid primary key`
- `share_link_id uuid not null`
- `display_name text not null`
- `session_token_hash text not null unique`
- `expires_at timestamptz not null`
- `created_at timestamptz not null`

This gives guest comments a stable identity without requiring an account. The guest session remains restricted to one share link.

### `comments`

- `id uuid primary key`
- `document_id uuid not null`
- `author_user_id uuid nullable`
- `author_guest_session_id uuid nullable`
- `body text not null`
- `parent_id uuid nullable` — reserved for optional threaded replies
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

A database constraint requires exactly one author type. The core release uses plain text comments, which avoids unsafe HTML handling.

### `chat_sessions`

- `id uuid primary key`
- `document_id uuid not null`
- `owner_user_id uuid nullable`
- `guest_session_id uuid nullable`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `chat_messages`

- `id uuid primary key`
- `chat_session_id uuid not null`
- `role enum` — `user` or `assistant`
- `content text not null`
- `citations jsonb`
- `created_at timestamptz not null`

Chat history is private to each owner or guest session. Comments, by contrast, are shared among authorized viewers of the document.

## 5. Authorization model

Every protected operation resolves an `AccessContext` before reading document data:

```text
Authenticated owner session -> document.owner_id must match user.id
Guest session -> active share link must match the requested document
No valid context -> 401/403 without revealing document metadata
```

Rules:

- Only the owner can list documents, upload files, create/revoke links, or delete a document.
- Owners and valid guests can view the PDF and summary, read/add comments, and use chat.
- A share token grants access only to its single document.
- Revoked, expired, malformed, and unknown tokens fail closed.
- Storage object paths use generated identifiers, never user-controlled filenames.
- Signed PDF URLs are short-lived and created only after access checks.

## 6. Upload and processing pipeline

1. The authenticated client requests an upload intent with filename, reported MIME type, and size.
2. The server enforces size limits and creates a document row plus a generated private storage path.
3. The PDF uploads to private storage using narrowly scoped, short-lived authorization.
4. The server verifies the `%PDF-` signature and parses the file; extension and browser MIME type alone are not trusted.
5. Text is normalized while preserving page boundaries.
6. Text is split into overlapping, page-aware chunks sized for retrieval.
7. Chunk embeddings are generated in batches and stored.
8. A map-reduce summary is used when the extracted text exceeds the summary model budget: summarize sections, then synthesize a final 3–5 sentence document summary.
9. The document becomes `ready`; the dashboard polls or refreshes processing state.
10. Failures set `failed` with a safe retry path rather than leaving an endless loading state.

Scanned/image-only PDFs are detected when extraction yields little or no text. OCR is outside the initial must-have scope unless time permits; the UI will explain that the document needs selectable text.

## 7. Grounded chat pipeline

For each question:

1. Authorize access to the requested document and chat session.
2. Load the latest five conversational turns.
3. Rewrite a context-dependent follow-up into a standalone retrieval query when needed.
4. Embed the query and retrieve the best matching chunks from that document only.
5. Apply a relevance threshold and cap the context by token budget.
6. Prompt the model with the retrieved passages, page labels, recent turns, and strict grounding instructions.
7. Require the model to state that the answer is not present when evidence is insufficient.
8. Return the answer with page citations and persist both messages.

The prompt will clearly separate system instructions, untrusted document text, conversation history, and the new question. Text contained inside a PDF is treated as data, not as executable instructions, reducing prompt-injection risk.

## 8. Route and page outline

### Pages

- `/signup` — name, email, password registration
- `/login` — email/password login
- `/dashboard` — owner document list, filename search, upload entry point
- `/documents/[documentId]` — owner document workspace
- `/share/[rawToken]` — guest entry and document workspace

### Server endpoints/actions

- authentication callbacks and session refresh
- create/finalize PDF upload
- retry document processing
- fetch authorized document metadata and short-lived PDF URL
- list/add comments
- create/list/revoke share links
- establish a guest session from a valid share token
- create/load chat session and send a question

Server responses use a consistent error shape and never return stack traces or secret values.

## 9. UI states that must be designed

- Empty dashboard and no search results
- Upload progress and invalid/oversized file errors
- Extracting/summarizing/ready/failed document states
- PDF viewer loading and rendering failure
- Revoked or invalid share link
- Guest name entry
- Empty comments and submitting comment
- Chat loading/streaming, retrieval failure, rate limit, and unsupported document answer
- Responsive desktop layout and tabbed/stacked mobile layout

## 10. Security baseline

- Environment variables validated at server startup; `.env.example` contains names only.
- Secure, HTTP-only cookies where application-managed tokens are needed.
- Passwords are handled only by the authentication provider and stored as secure hashes.
- PDF size, page count, and text limits prevent resource exhaustion.
- Comment and filename output is escaped; plain text is the default.
- Chat/comment endpoints receive per-user or per-guest rate limits.
- Share and guest tokens use cryptographically secure randomness and hashed-at-rest storage.
- Logs exclude raw tokens, PDF contents, passwords, and API keys.
- LLM requests send only the relevant document content and disclose this processing in the README.

## 11. Implementation sequence

1. Scaffold application, quality tooling, environment validation, and database client.
2. Add schema migrations, row-level security, signup/login, and protected dashboard shell.
3. Add private upload, PDF validation/extraction, processing states, and summary generation.
4. Build dashboard cards/search and the responsive PDF workspace.
5. Add hashed share links, guest sessions, and server-side access helpers.
6. Add persistent comments for both identity types.
7. Add chunk embeddings, retrieval, contextual chat, citations, and response streaming if stable.
8. Add automated tests for authorization and processing plus end-to-end smoke tests.
9. Deploy, verify all flows using production services, and fix deployment-specific issues.
10. Finish README, demo data, submission checklist, and walkthrough script.

## 12. Initial trade-offs

- Filename search is implemented before semantic dashboard search because semantic search is optional; document chat still uses semantic retrieval.
- Plain text comments precede formatting and threads to reduce security and UI complexity.
- Email invitations and password reset are deferred until the core deployment is reliable.
- Comments are persistent collaboration, not real-time socket synchronization; the assignment does not require live cursors or instantaneous updates.
- Page citations are included when extraction preserves reliable page boundaries, even though they are not explicitly required, because they make grounding visible to reviewers.

## 13. Architecture acceptance checks

Before feature implementation is considered complete, the deployed application must prove:

- User A cannot enumerate or open User B's document by changing an ID.
- A valid guest link opens exactly one document; revoked and altered links fail.
- Guests cannot invoke owner-only upload, share management, or delete operations.
- Invalid non-PDF content is rejected even if renamed with a `.pdf` extension.
- A long PDF is answered using retrieved passages, and an out-of-document question receives an explicit limitation.
- A follow-up question works using at least five recent turns.
- API keys, privileged database keys, permanent file URLs, and raw stored share tokens never reach the client or repository.
