# SubjectFocus – Base Functionality Specification

This document describes the minimal, end‑to‑end functionality for SubjectFocus, focusing on essential behaviors only. It aligns with the existing Supabase schema in `supabase/migrations/initial_schema.sql` and the stated stack.

## Tech Stack
- Frontend: Vite + React 18 + React Router v6 + Tailwind CSS
- Backend: Supabase (PostgreSQL, Auth, Row Level Security)
- AI: Claude API via n8n webhooks (HTTP)
- Deployment: Netlify or Vercel

## Existing Setup
- Supabase project linked via CLI; schema at `supabase/migrations/initial_schema.sql`.
- RLS enabled on all user data tables per schema policies.
- Git repo: https://github.com/dinequickly/subjectfocus.git

---

## 1) Authentication

Core goals: sign in/up, persist session, protect routes.

- Sign Up: email + password → Supabase Auth `signUp({ email, password })`; handle email verification.
- Sign In: email + password → `signInWithPassword({ email, password })`.
- Persisted Session: read from Supabase client; subscribe to `onAuthStateChange` to update UI state.
- Protected Routes: wrapper that redirects unauthenticated users to `/login`.
- Logout: `signOut()`; route to `/login`.

Data: profile rows live in `public.user_profiles` keyed to `auth.users.id`. Minimum behavior:
- On first authenticated load, fetch `user_profiles` by `id = auth.user.id`.
- If not found, allow user to create one (full_name optional).

---

## 2) Application Shell & Routing

- Routes: `/login`, `/signup`, `/`, `/study-set/new`, `/study-set/:id`.
- Layout: top nav (logo placeholder, user menu with logout), content area with responsive container.
- Loading and Empty States: basic text placeholders only.

---

## 3) Dashboard (Home `/`)

Data: `public.study_sets` scoped to current user (RLS allows owner, collaborator, or public).

- Fetch: list study sets for `auth.user.id` ordered by `updated_at desc`.
- Display: grid of sets with `title`, optional `subject_area`, card count (`total_cards`).
- Empty State: show prompt “Create your first study set”.
- Primary CTA: “Create Study Set” → `/study-set/new`.

---

## 4) Create Study Set (`/study-set/new`)

Form fields:
- Title (required)
- Description (optional)
- Subject area (dropdown: Biology, Chemistry, Physics, Math, History, English, Computer Science, Other)
- Color theme (preset choices; store selected string in `color_theme`)

Actions:
- Submit → `insert` into `public.study_sets` with `user_id = auth.user.id`, defaults for others.
- On success → navigate to `/study-set/:id`.

Validation: require Title; basic client checks only.

---

## 5) Study Set Detail (`/study-set/:id`)

Data: `public.study_sets` by id. Show:
- Title, description, subject, `total_cards`, created/updated timestamps (optional display), color theme (no styling requirements).

Actions:
- Edit Study Set: open simple form to update `title`, `description`, `subject_area`, `color_theme` → `update` row.
- Delete Study Set: remove row with `delete()` (schema uses soft delete for cards, but sets are owned; policy allows delete by owner). Confirm then navigate to `/`.

Flashcards section:
- Empty State: “No flashcards yet. Add your first card!”.
- Add Flashcard button → opens form with minimal fields:
  - Question (required)
  - Answer (required)
  - Optional: hint, explanation; difficulty defaults to 1
  - On submit: `insert` into `public.flashcards` with `study_set_id`.
- List Flashcards: show `question`, `answer`, `starred`.
- Edit Flashcard: inline or modal → `update`.
- Delete Flashcard: `delete()`; `total_cards` maintained via trigger.
- Star/Unstar: toggle `starred` boolean.

Ordering (optional minimal):
- If reordering is offered, update `card_order` integers; otherwise omit.

---

## 6) Review / Spaced Repetition (Minimal)

Data: `public.cards_due_for_review` view and `public.flashcard_progress` table.

- Fetch Due Cards: query `cards_due_for_review` for current user; optionally filter by `study_set_id`.
- Review Flow (basic): sequentially present each due card:
  - Show question; on “Reveal”, show answer.
  - Record Result: “Correct” or “Incorrect”.
  - Update/insert `flashcard_progress` for the card:
    - Increment `times_seen`.
    - Increment `times_correct` or `times_incorrect`.
    - Update `last_reviewed_at = now()`.
    - Minimal scheduling: set `next_review_date` to:
      - Correct → `now() + interval '1 day'` (baseline)
      - Incorrect → `now() + interval '10 minutes'`
    - Optionally track `interval_days`, `repetitions`, and `mastery_level` as simple steps (e.g., promote to `learning` after 1 correct, to `reviewing` after 3, to `mastered` after 7). Exact SM‑2 tuning can be deferred.

- Completion: when no due cards remain, show “All caught up!”.

---

## 7) Learning Sessions (Minimal)

Data: `public.learning_sessions`.

- Start Session: on entering review for a set, create a row with `user_id`, `study_set_id`, `session_type = 'flashcards'`, `started_at = now()`.
- During Session: increment counters locally (`cards_reviewed`, `cards_correct`, `cards_incorrect`).
- End Session: update row with totals, optional `completion_percentage`, `duration_seconds`, set `completed_at`.
- Display History (optional): list recent sessions for the set ordered by `started_at desc`.

---

## 8) Generated Content (Minimal)

Data: `public.generated_content`.

- Create Request: from a study set, allow user to request generation (e.g., “Study Guide” or “Flashcard Set”). Insert a row with:
  - `content_type` in allowed set (study_guide, quiz, flashcard_set, etc.)
  - `status = 'pending'`
  - `generation_prompt/params` as provided
- Trigger n8n: send an HTTP POST to an n8n webhook with the row id and context (study_set_id, user_id). Store the n8n execution id in `content_metadata` if available.
- Poll Status: periodically reselect the row; when n8n finishes:
  - On success: set `status = 'completed'`, persist output in `content_text` or `content_url`, set `generation_model`/`generation_cost` if returned.
  - On failure: set `status = 'failed'` and `error_message`.
- Display List: per set, show generated content rows with title and status; open to view `content_text` or link to `content_url`.

Notes: actual Claude API calls are handled within n8n; app only talks to the webhook and Supabase rows.

---

## 9) Calendar (Minimal)

Data: `public.calendar_events`.

- List: show events for current user ordered by `scheduled_date`; optionally filter to upcoming (index exists).
- Create: form with required fields:
  - `event_type` (test/exam/quiz/study_session/reminder/assignment_due/review_session)
  - `title`, `scheduled_date`, optional `study_set_id`, `all_day`
- Edit/Delete: update or remove events owned by user.
- Completion: toggle `completed` and set `completed_at`.

---

## 10) Tags (Minimal)

Data: `public.tags`, `public.study_set_tags`.

- Create Tag: for current user (`name`, optional `color`).
- Attach Tag to Set: insert into `study_set_tags` with `study_set_id` and `tag_id`.
- Detach Tag: delete link row.
- Filter by Tag (optional): query sets joined through `study_set_tags` for current user.

---

## 11) Collaboration (Minimal)

Data: `public.study_set_collaborators`.

- Add Collaborator: owner adds a `user_id` with role `editor` or `viewer`.
- Remove Collaborator: delete link row.
- View Collaborators: list for a set (RLS permits for owner and participants).
- Permissions: collaborator policies already enable read; `editor` role enables card modifications per policy.

Note: invitation flows and email are out of scope for base functionality.

---

## 12) Analytics (Minimal)

Data: `public.user_analytics` (daily aggregates); `public.study_set_overview` view.

- Dashboard: optionally show aggregate metrics from `study_set_overview` per set (mastered cards, sessions, total study time, average accuracy).
- Daily Summary: list rows from `user_analytics` for current user ordered by `date desc`.
- No in-app aggregation required; only reading existing rows/views.

---

## 13) Supabase Client & RLS Expectations

- All table operations occur through Supabase JS client using the authenticated session.
- RLS ensures users only access their own rows (or public/collaborator-permitted sets).
- Handle common errors:
  - `403`/RLS denied → show basic message: “You don’t have access to this resource.”
  - Not found → “This item doesn’t exist or is unavailable.”

---

## 14) Environment & Deployment

Environment variables (examples; name to match project setup):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)
- `N8N_WEBHOOK_URL` (for generation requests) — if called from frontend, ensure appropriate CORS; otherwise proxy via Netlify/Vercel serverless function.

Deployment targets:
- Netlify or Vercel static hosting for Vite build (`npm run build`, `dist/`).
- Ensure auth redirect URLs configured in Supabase for the deployed domain(s).

---

## 15) Non‑Goals (Base Scope Exclusions)

- Visual polish, animations, or advanced theming.
- Complex SM‑2 tuning beyond simple scheduling described.
- Offline support.
- Advanced collaboration (invitations, email, real‑time cursors).
- External calendar sync (Canvas/Google) beyond storing fields in rows.
- Role management UI beyond owner‑add/remove collaborator.
- Background job orchestration (handled by n8n).

---

## 16) Minimal UI Elements (Examples)

- Buttons: “Create Study Set”, “Add Flashcard”, “Edit”, “Delete”, “Start Review”, “Mark Correct/Incorrect”, “Complete”.
- Forms: straightforward inputs/selects; client validation only where required.
- Lists: study sets, flashcards, sessions, events, generated content, tags.
- Feedback: inline text for success/failure; no toasts/spinners required.

This spec is intended to ensure the product is usable end‑to‑end with the least complexity, fully aligned with the existing database schema and RLS policies.

