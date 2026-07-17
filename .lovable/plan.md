## Scope

Restyle the whole app to Vinmec-style, then add compliance features, admin dashboard, and follow-up module. No new tables — reuse `follow_ups`, `alerts`, `checklist_items`, `treatment_sessions`.

## Step 1 — Vinmec Restyle (global)

**Design tokens (`src/styles.css`)**
- Rewrite `:root` to Vinmec palette: `--primary #0077AA`, `--primary-hover #005F8A`, `--background #FFFFFF`, `--surface #F4F8FB` (used as `--card`, `--sidebar`, `--muted`), `--destructive #DC2626`, `--warning #D97706`, `--success #16A34A`, `--foreground #1A1A2E`, `--muted-foreground #6B7280`, `--radius 0.75rem` (12px cards), `--radius-md 0.5rem` (8px buttons).
- Convert hex → oklch for the token block (all color utilities already reference these tokens, so no per-component color changes required).
- Load Inter via `<link>` in `__root.tsx` head; set `--font-sans: Inter`.
- Base body font-size 15px; headings weight 600.

**Layout shell (`_authenticated/route.tsx`)**
- Fixed top navbar (h-14, white, shadow): logo left · main nav center · bell + VI/EN + user avatar right.
- Left sidebar collapsible to icon rail; active item: 3px `--primary` left border + `--surface` bg (patch `app-sidebar.tsx`).
- Add `<Breadcrumbs>` component driven by route matches; render at top of every inner page.
- Replace remaining `<Dialog>` uses (patients edit, allergies, exception reason) with a shared `<SlideOver>` panel (right-side sheet).
- Add `<Toaster position="top-right" richColors />` in root.

**Buttons**
- Add Vinmec variants to shadcn `Button`: default (primary fill, translateY(-1px) hover), outline (white + primary border), destructive (red).

## Step 2 — Compliance Core

**Checklist panel (`sessions.$id.tsx`)**
- Keep three grouped sections. Row: checkbox · label · role badge (color-coded by role) · status icon.
- Enforce `assigned_role` — checkbox disabled unless the current user's role matches (from `useAuth().roles`, mapped to checklist role via staff record).
- Soft-block banner (left-border card, amber) shown when clicking advance/close while required items still pending; advance is blocked until resolved or excepted.

**Exception logging**
- Replace the exception `Dialog` with a slide-over: `<Select>` reason category (`patient_refusal`, `equipment_unavailable`, `clinical_contraindication`, `other`) + `<Textarea>` free text.
- Row displays amber "Ngoại lệ" badge; exceptions count as satisfied for score (formula already used).

**Compliance score badge**
- New `<ComplianceRing>` component (SVG circular progress), color thresholds ≥90 green, 70–89 amber, <70 red.
- Use on session detail header, dashboard session card, Kanban card.

**Alert notification feed**
- Bell icon in navbar with unread count (`alerts` table where `dismissed_at is null`, filtered by role).
- Dropdown (Popover): newest first, colored left border by severity, message + link to session, "Dismiss" button (sets `dismissed_at`).
- Dismissed rows still readable via a "Show dismissed" toggle inside the session detail's log tab.

## Step 3 — Admin Dashboard rebuild (`dashboard.tsx`)

- **KPI row** (4 cards): clinic compliance rate (ComplianceRing gauge), open alerts (count + red/amber breakdown), overdue follow-ups (count from `follow_ups` where `due_date < now() and status='scheduled'`), active sessions grouped by pipeline stage.
- **Kanban board**: 6 columns matching pipeline stages, cards show patient, procedure badge, dentist name, ComplianceRing, alert chip. Subscribe to `treatment_sessions` via Supabase Realtime and invalidate query on change (add `treatment_sessions` and `alerts` to `supabase_realtime` publication in migration).
- **Bottom row**: left = recent alerts feed (last 20, inline dismiss); right = exception log table with CSV export button (client-side blob download).

## Step 4 — Post-Treatment Follow-Up

- **Auto-generate**: DB trigger on `treatment_sessions` — when `pipeline_status` transitions to `closed`, insert rows in `follow_ups` by procedure:
  - extraction → +1d, +7d
  - root_canal → +3d, +14d
  - implant → +1d, +7d, +30d
  - scaling → +7d
  - filling → +7d
- **Follow-up queue** (`/follow-ups` new route, receptionist + admin): sortable table by `due_date ASC`, columns per spec, inline status `<Select>` (`scheduled|contacted|completed|missed`) with color pills. No new page for editing.
- **Escalation**: scheduled cron/trigger via `pg_cron`-free approach — DB function `escalate_overdue_followups()` invoked on page load of admin dashboard (server function) and on follow-up list load: inserts an `alerts` row for each overdue follow-up without an existing open alert. Overdue count is included in the admin KPI card.

## Migrations

Single SQL migration:
1. `alter publication supabase_realtime add table treatment_sessions, alerts, follow_ups;`
2. `create trigger` on `treatment_sessions` for follow-up autogen (procedure-specific schedule).
3. `create function public.escalate_overdue_followups()` (security definer, admin-callable) that inserts alerts.
4. Any missing columns on `alerts` / `follow_ups` (verify with a read query first).

## i18n

Add all new labels (breadcrumbs, reason categories, follow-up statuses, KPI titles, kanban columns, exception categories, alert bell, etc.) to both `vi` and `en` dictionaries in `src/lib/i18n.tsx`.

## Files touched (approx.)

- `src/styles.css`, `src/routes/__root.tsx`, `src/routes/_authenticated/route.tsx`, `src/components/app-sidebar.tsx`, `src/components/language-toggle.tsx`
- New: `src/components/breadcrumbs.tsx`, `src/components/slide-over.tsx`, `src/components/compliance-ring.tsx`, `src/components/alerts-bell.tsx`, `src/components/kanban-board.tsx`, `src/components/role-badge.tsx`, `src/routes/_authenticated/follow-ups.tsx`
- Rewrites: `dashboard.tsx`, `sessions.$id.tsx`; patch `patients.$id.tsx`, `patients.index.tsx`, `appointments.tsx` (dialog → slide-over, button variants)
- `src/lib/i18n.tsx` (new strings)
- One Supabase migration
