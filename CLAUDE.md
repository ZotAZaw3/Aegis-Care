# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**Aegis Care** — an AI Clinic Operations Assistant for dental clinics (Vietnam context; VAIC 2026 entry + real product). Model is **Human-first, Agent-support**: clinicians make every clinical decision; the AI runs underneath to retrieve knowledge, watch process, summarize, and surface risks. Three pillars:

- **Compliance Knowledge Base** — SOPs, MoH regulations, protocols, checklists as *executable knowledge*: each rule carries required steps, applicability conditions, responsible role, evidence needed, and completion criteria. Not just a doc store — the basis for judging compliance. Built as `kb_rules` (deterministic rule engine → order drafts) + a RAG corpus (`kb_chunks` pgvector) for citation-backed legal Q&A.
- **Customer Graph (EMR)** — patient history/diagnoses/labs/meds/observations unified in `emr_*` tables, read via a 3-lane retrieval layer (never inference). See ARCHITECTURE.md. Lab **observations** (`emr_observations`) are curated by a KB whitelist (`emr_observation_whitelist`: INR, HbA1c, platelets, BP…) and surfaced as *facts* — value + unit + date + KB reference range, **never** a "high/abnormal" verdict — via `get_safety_panel` (+`observations`) / `get_observation_history`, feeding the SafetyPanel, the Compliance Judge (`observation_fact`), and the copilot `patient_labs` tool. Live clinic labs flow in via a `lab_orders`→`emr_observations` trigger (`source='clinic'`).
- **AI Agent** — advises with cited data, judges orders against the KB + record, flags gaps; the doctor decides. Realized as the copilot orchestrator (`/api/copilot`), the deterministic violation engine (`order_violations`), and the **AI Ops Report** (`/api/ops-report` + admin `/dashboard`): an on-demand operations report (summary + deterministic highlights + **Level-1 analysis** — ranking/comparison/trend only; no causal explanation, no recommendations) built on deterministic RPCs (`get_ops_metrics`/`get_ops_trends`); the LLM narrates already-computed numbers, never counts. Does NOT digitize the offline 7am briefing. Do not assume unbuilt features exist; verify in code.

**Invariants (do not violate):** Human-first · **Retrieval, NOT inference** (the agent narrates tool facts + citations, never diagnoses/recommends) · Deterministic-first (safety + violations are hard SQL queries, never LLM) · **No compliance_score** (violation = an open order that never closed, counted not scored).

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:8080
npm run build        # Production build → .output/ (Nitro; Vercel auto-detects)
npm run preview      # Preview the production build
npm run lint         # ESLint
npm run format       # Prettier --write
npx tsc --noEmit     # Typecheck — run after any change; this is the primary gate
```

There is **no test runner** configured (no `test` script, no framework installed). "Verify" here means `tsc --noEmit` + `npm run build` clean, plus driving the flow in the app. Don't invent a test command.

## Architecture

`ARCHITECTURE.md` is the authoritative description of the **order-centric core** (medical_orders as the trunk object, order lifecycle, 3 close tiers, consent gate, the 3-lane Customer Graph, roles/RLS, route map). Read it before touching clinical flow. It predates the AI-agent layer below — the two together are the current system.

**Stack:** React 19 + TanStack Start/Router (file-based routing, SSR shell, `src/routeTree.gen.ts` is generated) + TanStack Query · Tailwind 4 + shadcn/ui · Supabase (Postgres + Auth + Realtime + pgvector + Storage) · Vercel (via `nitro` plugin in `vite.config.ts`) · Vercel AI SDK (`ai`, `@ai-sdk/openai`) for the copilot.

**Two backends, one DB.** Most business logic is either (a) client-side calls straight to Supabase from route components under the user's JWT (RLS enforces access), or (b) **Postgres functions/triggers** (order routing, auto-close on evidence, consent gate, live-graph emitters). The only server-side compute is TanStack Start server routes and one Supabase Edge Function.

**Server routes (TanStack Start 1.168 API):** defined as
`createFileRoute('/api/x')({ server: { handlers: { POST } } })`. The `createServerFileRoute` API does **not** exist in this version — do not use it.

**Copilot orchestrator** (`src/routes/api/copilot.ts` + `src/server/copilot/`): Vercel AI SDK `generateText` with `stopWhen: stepCountIs(...)` and **8** Zod tools (`tools.ts`: `kb_search`, `find_patient`, `safety_panel`, `patient_history`, `crm_recall`, `patient_labs`, `open_violations`, `order_drafts`). The route builds a **per-request Supabase client from the caller's JWT** (anon key + `Authorization` header), so every tool runs under that user's RLS — never the service role. System prompt (`system-prompt.ts`) hard-enforces retrieval-only + anti-hallucination (ported from `services/rag-ingest/answer_generator.py`). The route accepts `patient_id` (single) or `patients: {id,name}[]` (multi) and injects the patient context into the system prompt. Returns `{ answer, citations[], tool_calls[] }`. UI: `src/components/copilot/` — the surface is the dedicated **`/assistant` page** (full-screen chat + multi-patient pin bar, `PatientPinBar`); the old global floating bubble (`copilot-chat.tsx`) is no longer rendered. Pages call `setPatient(id, name)` on `CopilotProvider` to pass patient context.

**RAG:** legal/SOP PDFs → chunks via the Python pipeline in `services/rag-ingest/` (offline ingest only) → embedded with OpenAI `text-embedding-3-small` → `kb_chunks` (pgvector). Retrieval is hybrid RRF (dense cosine + Postgres FTS) via the `kb_search` RPC. Scripts: `scripts/ingest-kb-chunks.mjs`, `scripts/eval-kb-retrieval.mjs`.

**Live Customer Graph:** `emr_*` rows carry a `source` column (`'synthea'` = ETL seed | `'clinic'` = real operations). Postgres triggers emit clinic rows when a visit goes `done` and when orders close, so new patients enter the graph without ETL. Seeded via `scripts/etl-synthea-patients.mjs` (streaming ETL, ~800 dental-rich Synthea patients into `patients` + `emr_*`, sharing the same `id`).

## Conventions & gotchas

- **Env split (critical):** `.env` is git-tracked and holds **only public** `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (client-side, RLS-protected). Secrets — `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — live in `.dev.vars` (gitignored) and are read server-side via `src/server/copilot/env.ts` / by scripts. Never put a service-role key in `.env`.
- **Vercel deploy:** `VITE_*` vars are inlined at **build time** — changing env in the Vercel dashboard requires a **redeploy** (and sometimes without build cache) to take effect. The server-only `OPENAI_API_KEY` must be set in Vercel env for the copilot to work in production; local dev reads it from `.dev.vars`.
- **Supabase project:** `rwvfpjtxcmubjqelsncq`. **Migrations in `supabase/migrations/` are applied manually via the Supabase SQL Editor**, not a CLI. They are immutable once applied — never edit an old migration; add a new `CREATE OR REPLACE` migration instead. File names are `YYYYMMDDHHMMSS_description.sql`.
- **Stale generated types:** `src/integrations/supabase/types.ts` was generated before the order-centric tables and is not regenerated. Code casts the client to bypass it — see the `ordersDb` / `db as any` pattern in `src/lib/orders.ts`; reuse it rather than fighting the types.
- **i18n:** every user-facing string is a key present in **both** `vi` and `en` in `src/lib/i18n.tsx` (flat dictionary; default lang `vi`). `t()` does no interpolation — build dynamic strings with `.replace()` on placeholder keys. Add both languages when you add a key.
- **File size:** keep files focused and roughly under ~200 lines; split into components/modules rather than growing a route file. Update existing files directly — don't create `*-v2`/`*-enhanced` duplicates.
- **Trigger functions** are `SECURITY DEFINER` with `SET search_path = public` and `REVOKE EXECUTE` from client roles — follow that pattern for any new trigger fn.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
