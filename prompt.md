Build a **document processing web app** inspired by WhyHow’s Knowledge Table: a spreadsheet-like table where **users define columns**, and each column can be **manual** or **processor-backed**. The system is **multi-user + multi-project** with project invitations and RBAC.

### 0) Tech constraints

* **Docker Compose** with exactly 3 services:

  1. `postgres` (with **pgvector**)
  2. `marker-api` wrapping `datalab-to/marker` with an HTTP endpoint protected by `X-API-Key`
  3. `next-app` (Next.js App Router, TypeScript)
* UI uses **Radix primitives components**, but **NO Tailwind**. Implement styling with **BEM CSS classes** in dedicated CSS files (e.g. `styles/components/button.css` containing `.button`, `.button--primary`, etc.).
* Database migrations/versioning: use **Prisma Migrate** *or* **Drizzle migrations** (pick one; prefer Prisma for speed).
* Processors:

  * **Auto-run on upload** for all columns that have processors configured
  * Allow **per-document per-column re-run**
  * Allow **bulk re-run across a project dataset** (entire table) for a given column

### 1) Core domain: multi-user, projects, access control

Implement:

* Users can sign in (choose a simple auth: email+password OR magic link via Auth.js).
* Users can create projects.
* Projects have members via `project_memberships` with roles: `owner`, `admin`, `member`.
* Users can **invite** by email to a project; invitation flow:

  * invite record with token + expiry
  * accept invite → membership created
* Every query is project-scoped; a user sees only projects they’re a member of.

### 2) Document ingestion

In a given project:

* User can add documents via:

  * **Drag & drop upload** (PDF initially)
  * **URL input** (any domain allowed)
* Persist the raw document on a mounted filesystem volume:

  * `/data/projects/<projectId>/docs/<docId>/source.pdf` OR `source.url.txt`
* Store document metadata + source reference in Postgres:

  * source type: `upload` or `url`
  * url if applicable
  * file path if upload

### 3) Knowledge-table UI (table + dynamic columns)

Provide a “table view” similar in spirit to WhyHow knowledge-table:

* Left nav: project list, current project
* Main: **Documents table**

  * columns include base fields: `title`, `source_type`, `created_at`, plus **user-defined columns**
  * cells:

    * manual columns are editable
    * processor columns show value + “run / rerun” and run status
* Column management:

  * Add column with types:

    * `text`, `number`, `text[]`, `number[]`
  * Each column has **mode**: `manual` or `processor`
  * If processor: select processor type + configure inputs (similar to knowledge-table assigning processors to columns)

### 4) Data model (JSONB for dynamic values)

Use JSONB for per-document dynamic values, plus explicit `columns` definitions.

Tables (suggested):

* `users`
* `projects`
* `project_memberships` (`user_id`, `project_id`, `role`)
* `project_invites` (`project_id`, `email`, `token`, `expires_at`, `accepted_at`)
* `documents`

  * `id uuid`, `project_id`, `title`
  * `source_type ('upload'|'url')`, `source_url`, `file_path`, `mime_type`
  * `values jsonb` (keyed by `column.key`)
  * timestamps
* `columns`

  * `id uuid`, `project_id`
  * `key` (slug, unique per project), `name`
  * `type` enum (`text|number|text_array|number_array`)
  * `mode` enum (`manual|processor`)
  * `processor_type` nullable
  * `processor_config jsonb` nullable (stores input column refs, prompts, etc.)
* `processor_runs`

  * `id`, `project_id`, `document_id`, `column_id`
  * `status (queued|running|success|error)`
  * `started_at`, `finished_at`, `error`
  * `meta jsonb` (timings, token usage, etc.)
* `chunks`

  * `id`, `project_id`, `document_id`
  * `source_column_key`, `chunk_index`, `text`, `meta jsonb`
* `embeddings`

  * `id`, `project_id`, `document_id`, `chunk_id nullable`
  * `source_column_key`
  * `embedding vector(<DIM>)` using **pgvector**
  * `model`, `meta jsonb`

Enable pgvector extension in Postgres init/migration.

### 5) Processor system (column-assigned, like knowledge-table)

A processor is a pluggable job that:

* reads: document source + referenced input columns from `documents.values`
* writes: output into `documents.values[targetColumnKey]`
* records run status in `processor_runs`

**Template syntax:** column references use `{{title}}` / `{{someColumnKey}}`.

**Processor assignment:** each processor column stores:

* `processor_type`
* `processor_config`, e.g.:

  * input column keys
  * prompt template
  * chunk settings
  * embedding settings

### 6) Required processors in MVP

Implement these processor types:

1. **PDF → Markdown (marker)**

* Only for uploaded PDFs
* Call `marker-api` endpoint with `X-API-Key`
* Store returned markdown string into target column (and optionally also save `/data/.../marker.md`)
* (No images needed)

2. **URL → Text (@mozilla/readability)**

* Fetch URL server-side
* Parse with JSDOM + Readability
* Store extracted text (or markdown-like text) to target column
* Enforce safety controls: timeouts, max download size, content-type checks; allow all domains but prevent obvious SSRF (block localhost/private IP ranges).

3. **Chunk text**

* Input: select a source text column key in config
* Produce chunks with configurable size + overlap (simple char-based or token-ish heuristic)
* Write either:

  * `text[]` into target column, and/or
  * rows into `chunks` table (recommended as canonical)

4. **Create embeddings (OpenAI + pgvector)**

* Input: either a text column or `chunks`
* Use OpenAI embeddings API
* Store vectors in `embeddings.embedding` (pgvector), link to `chunk_id` when embedding chunks

5. **OpenAI API call (prompted transform)**

* Config: model, temperature, prompt template
* Expand template with `{{columnKey}}` variables from the document row
* Store response text to target column
* Save token usage / latency in `processor_runs.meta`

### 7) Job execution without adding more containers

Because compose must stay at 3 services, implement a Postgres-backed job queue:

* Use **pg-boss** or **graphile-worker**.
* The Next app container runs:

  * the web server
  * a worker process (same image, separate node process) consuming jobs
* On events:

  * **On document creation**: enqueue jobs for all processor columns in that project
  * **Manual per-cell rerun**: enqueue one job
  * **Bulk rerun**: enqueue one job per document (rate limited)

### 8) Next.js API surface

Provide endpoints/server actions:

* documents: create (upload/url), list, read, update title
* columns: create/update (mode, processor config), list
* runs: trigger rerun (single/bulk), list runs
* ensure all endpoints enforce project membership

### 9) CSS requirement (BEM, no Tailwind)

* Create `styles/` with component CSS files:

  * `button.css` defines `.button`, modifiers, sizes
  * `table.css`, `modal.css`, etc.
* Use semantic BEM naming: `.table`, `.table__row`, `.table__cell`, `.table__cell--editable`, etc.
* UI components should apply these classes; do not use utility classes or Tailwind.

### 10) Acceptance criteria (MVP)

* docker-compose up brings up postgres, marker-api, next-app
* multi-user auth works; projects + invites work
* users see only projects they belong to
* documents can be added via upload or URL and are persisted on mounted volume
* table view shows documents + dynamic columns
* processor columns are assignable like knowledge-table, run automatically on upload, and can be rerun per document or in bulk
* embeddings stored in Postgres pgvector
* runs show status + errors
