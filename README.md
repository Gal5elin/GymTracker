# GymTracker

Local development foundation for the React frontend, Express REST API and PostgreSQL database. Feature behavior is planned in issues US-01–US-16; this setup implements issue #35.

## Prerequisites

- Node.js 22.12+ (Node 24 LTS recommended), npm 10+, Docker with Compose.
- Available local ports: 5173 (frontend), 3000 (API), 5432 (database).

## First startup

Run from the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Replace JWT_SECRET in backend/.env with a random secret (at least 32 characters).
npm run db:generate
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173 to register a member account, or http://localhost:5173/#demo/dashboard to try the workout demo with sample data. The prototype runs independently of the API; start just the frontend with `npm run dev -w frontend`. See [frontend/README.md](frontend/README.md) for the demo flow and its limitations. The API still provides `GET http://localhost:3000/api/health` for availability checks; it does not query PostgreSQL. Stop development servers with Ctrl+C.

The API validates its environment on startup. `backend/.env` contains `DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_ORIGIN`, and the local-only `SEED_PASSWORD`. The frontend uses `frontend/.env` for `VITE_API_URL` (API origin without `/api`); restart Vite after changing it. Never put secrets in `VITE_*` variables, which are public client configuration. Environment files are ignored by Git; examples are safe to track.

Docker binds PostgreSQL to localhost and persists it in a named volume. The Compose credentials and example seed password are for local development only. If port 5432 is occupied, change the host mapping and `DATABASE_URL` together.

## Development commands

```sh
npm run dev             # API reload and Vite together
npm run typecheck       # Both apps, tests and seed script
npm test                # Frontend model tests and Supertest API tests
npm run build           # Compile backend and build frontend
npm run db:generate     # Generate Prisma client after schema changes
npm run db:dev -- --name describe_change # Create a migration after schema changes
npm run db:migrate      # Apply checked-in migrations
npm run db:seed         # Repeatable local seed
npm run db:down         # Stop database; retain its volume
```

To create a migration after editing `backend/prisma/schema.prisma`, use `npm run db:dev -- --name describe_change` from the root. CHECK constraints are maintained in migration SQL because Prisma does not represent them in its schema. Review generated migrations before applying them. Never edit an already-applied migration.

You can run apps independently with `npm run dev -w backend` and `npm run dev -w frontend`. After building, `npm start -w backend` starts the compiled API; `npm run preview -w frontend` previews the frontend (configure `FRONTEND_ORIGIN` to its URL to allow browser requests).

## Authentication API and database tests

`POST /api/auth/register` accepts `{ "displayName": "Your name", "email": "you@example.com", "password": "a-long-password" }`.
Names are trimmed (1–100 characters); email is trimmed, lowercased and validated (maximum 254 characters).
Passwords must contain 12–128 characters and are hashed with Argon2id without trimming.
Registration creates an active `MEMBER` by default, or an active `TRAINER` when `registerAsTrainer` is true; unknown fields, including client-supplied roles, are rejected.
Success returns `201` with `{ user: { id, displayName, email, role, isActive, createdAt } }` and no credentials.
Invalid input returns `400`; a duplicate normalized email returns `409`.

`POST /api/auth/login` accepts `{ "email": "you@example.com", "password": "a-long-password" }`.
Email is normalized as in registration; passwords are verified against their Argon2id hash.
Success returns `200` with `{ accessToken, tokenType: "Bearer", expiresIn: 3600, user }`.
Wrong credentials and inactive accounts return the same `401` error; invalid request shapes return `400`.
Tokens use HS256, the configured `JWT_SECRET`, issuer `gymtracker`, audience `gymtracker-api`,
and a one-hour expiry. Token responses are marked `Cache-Control: no-store`.

`GET /api/auth/me` is protected and returns the current safe user details when sent
`Authorization: Bearer <accessToken>`. Missing, invalid or expired tokens and deleted/inactive
accounts return `401`. The reusable `requireAuthentication(secret)` middleware validates the token,
loads the current active account, and supplies it as `res.locals.user` for future protected routes.
Role and ownership authorization use the helpers described below. Health, registration and login remain public.
Login also sets a persistent HttpOnly `gymtracker_session` cookie, backed by a hashed token in
`auth_sessions`, with an absolute 30-day lifetime. `POST /api/auth/session` restores the in-memory
access token after reload or access-token expiry. `POST /api/auth/logout` deletes the current session,
clears the cookie and invalidates its access tokens. Each JWT must reference a live session via `sid`.
Both endpoints use `credentials: include`; authentication mutations reject untrusted browser origins.
Other devices retain their own sessions. See ADR 0004.

Apply the migration with `npm run db:migrate -w backend` before starting the updated API.
Production must set `NODE_ENV=production` to enable Secure cookies and serve both frontend and API
via HTTPS on the same site (for example `app.example.com` and `api.example.com`). Configure
`FRONTEND_ORIGIN` to the exact frontend origin. Local development uses `localhost` for both services;
do not mix it with `127.0.0.1`. No localStorage or sessionStorage tokens are used.

Integration tests require a separate database; they never seed or clear the development database.
Create it once with PostgreSQL running:

```sh
docker compose exec -T db createdb -U gymtracker gymtracker_test
```

Add `TEST_DATABASE_URL` from `backend/.env.example` to `backend/.env`, then run:

```sh
npm run test:integration -w backend
```

The database name must end in `_test` and differ from the development database name.
Tests apply checked-in migrations automatically and remove only their generated test accounts.
`npm test` continues to run the database-independent tests.

## Owned programs and days

US-08 backend (#17) supports these authenticated member/trainer endpoints:

| Method | Path | Request / response |
|---|---|---|
| GET | `/api/programs` | `{ programs }`, only the current user's programs, newest first |
| POST | `/api/programs` | `{ name, description? }` → `201 { program }` with `Location` header |
| GET | `/api/programs/:programId` | `{ program }` including `days` ordered by `dayNumber` ascending |
| PATCH | `/api/programs/:programId` | `{ name?, description? }` → `{ program }` |
| POST | `/api/programs/:programId/days` | `{ dayNumber, title }` → `201 { day }` |
| PATCH | `/api/programs/:programId/days/:dayId` | `{ dayNumber?, title? }` → `{ day }` |

Program names are trimmed, required and limited to 200 characters. Descriptions are optional,
trimmed and limited to 5,000 characters; blank or null clears the description. An omitted PATCH
field retains its current value. Day titles are trimmed, required and limited to 100 characters.
Day numbers must be positive integers within PostgreSQL's integer range; gaps are allowed.
PATCH requires at least one editable field. Unknown fields (including owner and parent IDs) are rejected.

The server assigns `ownerId` from authentication. Only the owner may read or change a program or
add/change its days, including when another caller is a linked trainer. The day URL must match its
parent program. Unauthenticated callers receive `401`, admins/non-owners `403`, malformed inputs
or IDs `400`, missing records `404`, and duplicate day numbers within a program `409` with a
`fields.dayNumber` message. The database uniqueness constraint also protects concurrent requests.
Program/day validation errors return `{ error, fields }`. No schema migration is needed.

The authenticated program/day editor (#18) is available at `/#programs` for members and trainers.
Create a program, open it, and add or edit its numbered days. The editor shows validation, duplicate-number
and denied-edit feedback and retries failed loads/saves without discarding entered values. Exercise
planning APIs (#19) and their editor controls (#20) are available. Open **Plan exercises** on a
day card to choose catalog exercises, enter sets/reps and optional weight, or edit/remove planned
entries. **Up/Down** saves the new order immediately. Use the **Workout** tab to launch a day.

## Exercise catalog and planned exercises

US-09 backend (#19) exposes `GET /api/exercises` to authenticated users. It returns
`{ exercises }` with active entries from the predefined seeded MVP catalog, ordered by name.
Each entry contains `id`, `name`, `muscleGroup`, `equipment` and `isActive`. Catalog administration
and advanced search/filtering remain outside this issue.

The following routes require an authenticated member/trainer who owns the parent program:

| Method | Path | Request / response |
|---|---|---|
| GET | `/api/programs/:programId/days/:dayId/exercises` | `{ exercises }` ordered by position |
| POST | `/api/programs/:programId/days/:dayId/exercises` | `{ exerciseId, position, targetSets, targetReps, targetWeightKg? }` → `201 { exercise }` |
| PATCH | `/api/programs/:programId/days/:dayId/exercises/:entryId` | Any nonempty subset of the create fields → `{ exercise }` |
| DELETE | `/api/programs/:programId/days/:dayId/exercises/:entryId` | Removes the planned entry → `204` |
| PUT | `/api/programs/:programId/days/:dayId/exercises/order` | `{ exerciseIds: [entryId, ...] }` → `{ exercises }` with positions `1..N` |

`GET /api/programs/:programId` also includes each day's `exercises` ordered by position.
Planned entries embed catalog details under `exercise`, including for an existing selection that
has since been deactivated. New or changed catalog selections must be active. The same catalog
exercise may appear more than once; use the **planned entry IDs**, not catalog IDs, when editing,
removing or reordering.

Positions, target sets and target reps must be positive integers within PostgreSQL's integer range.
Weight is optional/null, accepts zero, and must be between 0 and 9999.99 with at most two decimal
places. Weight is returned as a decimal **string** or null. Omitted PATCH fields retain saved values;
null clears weight. Unknown fields and client-supplied owner/parent IDs are rejected.

Reorder requires every current entry ID exactly once, with no foreign or duplicate entries. All
mutations lock the same day row and run in a database transaction. Reorder moves entries through
unused positive positions before assigning the final order, so swaps respect the existing unique
constraint throughout. Concurrent edits serialize; rejected operations leave the list unchanged.
Add/edit position conflicts return `409` with `fields.position`; invalid input, inactive catalog
selections or stale/incomplete reorder lists return `400`. Missing records/parent mismatches return
`404`; non-owners and admins receive `403`, unauthenticated callers `401`. Other users' plans cannot
be read or edited, even by a linked trainer. Removing an entry leaves other positions unchanged.

No schema migration is needed. The connected exercise planner (#20) is available through
**My programs → View program → Plan exercises**. It preserves entered targets after failed saves
and while refreshing a stale list. Repeated catalog selections remain distinct planned entries.

## Workout startup and frozen plans

US-11 backend (#23) exposes `POST /api/workout-sessions` with
`{ programId, dayId, assignmentId? }` for members and trainers acting for themselves.
The program must be owned by the actor or assigned to them, and the day must belong to that program.
A supplied assignment must match both the actor and program. Without an assignment ID, the server
uses the earliest matching assignment; for an owned program it reuses or creates a self-assignment.
A member retains access to an existing assignment even after trainer collaboration ends.

A successful new start returns `201 { workout }` with `Location`, `status: IN_PROGRESS`, a server
start time, the assignment ID and `planSnapshot`. The version-1 snapshot contains program/day names
and identifiers plus the ordered exercises, catalog names/equipment/muscle groups, original entry IDs
and target sets/reps/weight. Weight is a decimal string or null. It is never rebuilt from the current
plan, so later renames, edits, removals, reordering and catalog deactivation do not change it.
Actual performed sets remain separate from these targets.

Startup locks the user, program and day in a transaction. Concurrent starts serialize; retrying the
same active day returns `200` with the existing workout and unchanged snapshot. Starting a different
day while a workout is active returns `409`. Empty days and malformed/forged input return `400`,
inaccessible programs/assignments `403`, and nonexistent or mismatched days `404`. The server assigns
member, status, start time and snapshot; clients cannot supply these fields. Failed starts create
neither workouts nor self-assignments. Active-workout serialization must also be used by future
workout-creation entry points.

`GET /api/workout-sessions/active` returns `{ workout }` (null when none), scoped to the actor.
`GET /api/workout-sessions/:sessionId` returns only the owner's workout, including the frozen plan.
Admins cannot use these endpoints; missing authentication returns `401`. Trainer consent does not
allow starting or reading another user's workout through these owner-only endpoints.

Apply the snapshot migration with `npm run db:migrate -w backend` before starting the updated API.
Legacy workouts retain `planSnapshot: null`; their historical plan cannot be reconstructed reliably.
All new API-created workouts have a versioned snapshot. Future set-recording endpoints must validate
exercises and positions against this snapshot, not the live program.

The launch screen (#24) is connected under `/#workout`. It first checks for the current active
workout and displays its saved plan; navigation or reload reopens it from the server. If none is
active, `GET /api/workout-sessions/options` supplies owned and assigned programs with ordered days
and planned exercises. The read-only response includes `source` (`OWNED`/`ASSIGNED`) and an
`assignmentId` for assigned programs, without exposing other members' assignments or granting plan
editing rights. Historical assignments remain available after trainer collaboration ends.

Choose a program and a nonempty day to start. The frontend prevents duplicate clicks, retains
selection after a failed start, offers refreshed choices for stale/denied selections and opens the
current active workout after a conflict. Empty programs/days and missing legacy snapshots have
explicit states. The saved view shows ordered exercises and target sets/reps/optional weight;
set logging (#26) and completion (#28) are connected to their APIs. The independent demo is unchanged.

## Performed-set recording

US-12 backend (#25) supports `POST /api/workout-sessions/:sessionId/sets` with
`{ exerciseId, exercisePosition, setNumber, reps, weightKg? }`. Success returns `201 { set }`
with the stored identifiers, actual performance and creation time. Only the workout owner may
write, and only while it is `IN_PROGRESS`; trainers retain these functions for their own workouts.
Owning the source program or having an accepted trainer link does not grant permission to write
another member's sets. The session ID comes from the URL; actor and timestamps are server-assigned.
Unknown fields are rejected.

Exercise ID **and** position must match the workout's frozen snapshot, including distinct occurrences
of the same catalog exercise. Live-plan reordering, replacement/removal, or catalog deactivation
do not redefine that membership. Legacy or invalid snapshots cannot safely authorize new sets;
they return `409` rather than falling back to the current program.

Reps, set number and exercise position must be positive whole numbers within PostgreSQL's integer
range. Weight is optional/null, permits zero, and must be 0–9999.99 with at most two decimal places.
It is returned as a decimal string or null. Omitted weight stays null, never the planned weight.
Actual reps/weight may differ from targets and the number of performed sets may exceed planned sets.
Set numbers may have gaps.

Duplicate `(sessionId, exercisePosition, setNumber)` values return `409` with `fields.setNumber`;
retries never overwrite the originally saved performance. Invalid input or snapshot membership returns
`400`, missing workouts `404`, non-owner/admin callers `403`, and missing authentication `401`.
Completed workouts return `409`. A database transaction locks the workout row before checking status
and inserting; finalization uses the same `lockOwnedWorkout` helper and checks state under
that lock. The existing database uniqueness constraint also protects concurrent duplicates.

`GET /api/workout-sessions/:sessionId/sets` returns `{ sets }`, sorted by exercise position and
set number. Only the owner can read this endpoint, including after completion; it never returns
another member's data. Saved sets are append-only through this API: edits/removal are not exposed.
No schema migration is needed. Set entry (#26) is connected in the **Workout** tab.
The active view reloads saved sets and workout state before enabling writes, then shows one blank
next-set row per exercise. Actual reps must be entered; blank weight remains null even when the
plan has a target weight. Saving a row makes it read-only and opens the next set, including beyond
the planned target count. Repeated exercise occurrences are distinguished by snapshot position.

Failed saves retain entered values. Duplicate/status conflicts reload authoritative saved values
and workout state without overwriting an existing set; completed workouts disable further entry.
**Reload saved sets** recovers server data without discarding drafts for other unsaved rows.
Navigation/reload restores recorded sets from the API; unsaved drafts are held only while the
current screen is mounted. No browser storage is used for workout data. Shared set-row controls
also serve the separate demo. Workout completion and notes are connected in #27–#28.

## Workout completion and notes

US-13 backend (#27) supports `POST /api/workout-sessions/:sessionId/complete` with
`{ notes? }` (an empty body is also accepted). Only the owner may complete an `IN_PROGRESS`
workout, and at least one saved performed set is required. Completing all planned sets is not
required. Success returns `200 { workout }` with `status: COMPLETED`, a server-assigned `finishedAt`
and the stored notes. The original start time, snapshot and performed sets are unchanged.

Notes are optional/null, trimmed and limited to 2,000 characters after trimming. Blank or null
clears notes; omission preserves an existing note. Wrong types, excess length and unknown fields
(including client-supplied status, owner, sets or completion time) return `400`. An empty workout
also returns `400` and stays active without saving notes or a completion time. Authentication,
ownership and role rules match set recording: `401` without authentication, `403` for another
owner or admin, `400` for malformed IDs and `404` for missing workouts.

Completion takes the same workout row lock as set recording, then checks state and saved sets
inside the transaction before saving status/time/notes together. A racing set can commit before
completion or be rejected afterward; it cannot be written into an already completed workout.
Concurrent completion requests produce one success and one `409`; repeated completion cannot
change the first saved notes or time. Further sets return `409`. The completed workout no longer
appears in `/api/workout-sessions/active`, but owner-only workout and saved-set reads remain available.
If a completion response is lost, clients should read the workout state before offering a retry;
this endpoint deliberately rejects repeat completion rather than overwriting it.

No schema migration is needed. The frontend Finish workout and notes flow (#28) is connected
in the active workout. An empty workout shows an error while preserving notes. During completion,
set saves and repeat finish clicks are disabled. Failed requests retain notes; uncertain results
trigger a read of the server state before a retry is allowed. If both completion and its recovery
read fail, **Reload saved sets** must establish the current state before another finish attempt.
Existing completed notes/time are never overwritten by the retry flow.

After finishing, the screen shows the server's saved notes and completion time with set entry
locked. It also reloads saved sets for the completed summary. The URL becomes `/#workout/:sessionId`
so the owner can reload or return to the completed state without browser storage. These links use
the same login/role guards and owner-only API as the active screen. **Choose another workout**
returns to launch choices. History APIs (#29) and the History tab (#30) are connected. Unsaved notes
remain in memory only until completion or leaving the screen; completion persists them in PostgreSQL.

## Private workout history

US-14 backend (#29) adds owner-only completed history:

| Method | Path | Response |
|---|---|---|
| GET | `/api/workout-sessions/history?limit=20&cursor=<id>` | `{ workouts, nextCursor }` |
| GET | `/api/workout-sessions/history/:sessionId` | `{ workout }` |

The list includes only the authenticated actor's `COMPLETED` workouts, ordered by start time
newest first, then UUID descending to break ties. Each summary contains `id`, `status`, `startedAt`,
`finishedAt`, `program: { id, name }`, `day: { id, dayNumber, title }`, `snapshotAvailable` and
`setCount` (the number actually recorded, not planned). Empty history returns an empty list.

The default page size is 20; `limit` must be a positive integer string up to 100. Pass the returned
`nextCursor` for the next page; null marks the end. Cursor IDs must belong to the actor's completed
history. Invalid, foreign, active-workout or missing cursors return `400`. Unknown query parameters,
including attempts to select another member or status, are rejected.

Detail includes `id`, `status`, start/completion times, `notes`, the saved program/day labels,
`snapshotAvailable` and `exercises`. Exercise groups originate **only from performed sets**, ordered
by `exercisePosition`; unperformed planned exercises are omitted. Each group has `exerciseId`,
`exercisePosition`, saved `name`, `muscleGroup`, `equipment` and its ordered `sets`. Sets contain
`id`, `setNumber`, actual `reps`, actual `weightKg` (decimal string or null) and `createdAt`.
Repeated occurrences of a catalog exercise remain separate by position, and zero weight stays zero.
Target values do not substitute for actual performance.

Names come only from the workout snapshot. Program/day edits, exercise removal or reordering and
catalog edits/deactivation cannot change these results. Legacy or unsupported snapshots return
`snapshotAvailable: false` and null program/day/exercise labels while preserving actual sets and
notes; live names are never substituted. A missing snapshot match for an individual performed
entry likewise leaves its descriptive labels null. Legacy completion times can remain null.

Members and trainers can read only their own history through these endpoints. An accepted trainer
link or ownership of a source program does not grant access to a recipient's private history;
trainers use the separate member-scoped endpoints described below. Existing assigned-workout history stays
with the recipient after collaboration ends. Missing login returns `401`, non-owners/admins `403`,
invalid IDs `400`, and missing or non-completed history details `404`. Responses are `no-store`.
There are no history write endpoints and no schema migration. The History tab (#30) loads these
private completed records at `/#history`; each row opens a guarded `/#history/:sessionId` detail.
Rows show execution date, saved program/day labels, actual set count and duration where available.
**Load more workouts** follows server cursors, keeps loaded rows on page failure, and offers retry.
Returning from a detail keeps already loaded pages; **Refresh history** fetches the latest first page.
Completed workouts also offer **View in history** after finishing.

Details show only recorded exercise groups, actual sets/reps/weights, saved notes and completion
time, with no editing controls. Repeated exercise occurrences remain separate by position; zero
weight is shown as zero and null as **No weight recorded**. Unknown legacy names and durations are
marked unavailable, while performed results remain visible. Empty history offers a workout launch
link; denied/missing details offer feedback and a back link. List/detail failures support retry,
and requests are cancelled on navigation. Detail links reload after authentication is restored.
The independent demo shares the history-row layout and keeps its sample data separate.

## Personal exercise progress

US-15 backend (#31) exposes these authenticated member/trainer endpoints:

| Method | Path | Response |
|---|---|---|
| GET | `/api/progress/exercises` | `{ exercises }` for exercise selection |
| GET | `/api/progress/:exerciseId` | `{ exercise, points }` for the actor's selected exercise |

Exercise choices include the active catalog plus deactivated exercises that occur in the actor's
completed saved sets (including bodyweight-only records). They are ordered by name and ID and
contain `id`, `name`, `muscleGroup`, `equipment` and `isActive`. Historical deactivation therefore
does not remove a previously recorded exercise from the selection list. Exercise metadata comes
from the current global catalog; workout history continues to use frozen snapshot names.

For the selected exercise, PostgreSQL computes the maximum actual `weight_kg` across all matching
sets and exercise positions in each of the actor's completed workouts. Unfinished workouts and
null weights are excluded; zero is included. Each point contains `workoutId`, `startedAt`,
`finishedAt` (nullable for legacy records) and `maxWeightKg` as an exact decimal string in kilograms.
Points are ordered by workout start time ascending, then UUID ascending for ties. Separate workouts
on the same date remain separate points. No planned target weights or local-date grouping enter
the calculation. The aggregation runs in PostgreSQL without converting weights through JavaScript
floating-point numbers.

An existing exercise with no eligible data returns `200` with `points: []`. The endpoint can read
a deactivated exercise by ID. Invalid UUIDs return `400`, nonexistent exercises `404`, missing
login `401` and admin access `403`. Query parameters, including alternate member/status filters,
are rejected with `400`; the actor always comes from authentication. Trainers see only their own
personal progress here, even when linked to another member. Separate trainer-read endpoints are
still tracked in their own issues. Responses are `no-store`.

Program edits, exercise removal or catalog deactivation do not alter recorded maxima. Legacy
workouts without snapshots can contribute their valid completed sets. No migration is needed.
The signed-in **Progress** tab uses these endpoints for its exercise selector and chronological maximum-weight chart. Inactive exercises with completed results remain selectable. Same-day workouts stay separate, zero weights are included, and exercises without eligible results show a no-data message. Expand **View workout values** for exact weights and links to completed workout details. Loading failures can be retried; switching exercises cancels the previous request. The public demo shares the chart presentation while keeping its sample data separate.

## Server permissions

`backend/src/permissions.ts` provides role middleware and database-backed checks for program/day
ownership, workout ownership, private results access, accepted trainer links and trainer assignments.
Unauthorized actions return JSON `403`; missing authentication returns `401`. Trainers retain personal
member functions. Administrators have no override for private results, workout recording or personal
programs/assignments. Registration rejects supplied roles; its optional boolean `registerAsTrainer` creates an active trainer when true, otherwise an active member.

Feature namespaces (`/api/programs`, `/api/assignments`, `/api/workout-sessions`, `/api/progress`,
`/api/trainer-links`) require an authenticated member or trainer. `/api/exercises` requires authentication.
Feature routes are implemented in their own issues; valid callers currently receive `404` on those
unimplemented endpoints. Mount new routers after these guards and before the fallback handler.

After `requireAuthentication`, use `authenticatedUser(res)` as the actor; never use a body/query user ID
or role as the actor. Call `requireProgramOwner`, `requireDayOwner` or `requireWorkoutOwner` before
accessing/mutating those records. Use `requireMemberResultsAccess` for history/progress and
`requireTrainerAssignment` before assigning a trainer-owned program. Personal self-assignment uses
the member's own program ownership check in the workout-start issue. Trainer reads and assignments
recheck the current `ACCEPTED` link on every operation; pending/rejected/revoked links grant no access.
Permission checks must be composed with each feature's validation and transactional mutation rules.

Database integration tests cover the production namespace guards and test-only resource routes using
these helpers; no test resource routes are exposed by the real app.

## Local seed accounts

| Email | Role |
| --- | --- |
| member@gymtracker.local | MEMBER |
| trainer@gymtracker.local | TRAINER |
| admin@gymtracker.local | ADMIN |

All use `SEED_PASSWORD` from `backend/.env` (example: `GymTracker-dev-123!`). Passwords are stored as Argon2id hashes. Seeding upserts accounts by email and six exercises by stable UUID, so rerunning it creates no duplicates. It resets demo account passwords/roles and the seeded catalog values. The seed is refused when `NODE_ENV=production`. The login API and frontend login flow are available at `/#login`; login survives page reloads for up to 30 days, until logout or expiry.

## Structure

- `frontend/`: React, TypeScript, Vite, Tailwind CSS; Recharts installed for progress views.
- `backend/src/`: Express app, environment validation, server and API smoke tests. Zod, JWT and Argon2id are installed for upcoming features.
- `backend/prisma/`: documented MVP data model, initial SQL migration, development seed.
- `docs/`: scope, user stories, architecture and data model.

Unique keys, foreign keys and numeric checks are enforced in PostgreSQL. Role/ownership permissions, accepted trainer links, assignment consistency and workout completion rules require service logic in the feature issues. Historical references use restrictive deletion to preserve workout records.


### Trainer invitation creation (#11)

`POST /api/trainer-links` requires an active authenticated `TRAINER`. Send
`{ "email": "member@example.com" }` to invite an existing active `MEMBER` account.
Email is trimmed and lowercased. Trainer identity comes from authentication; unknown
fields (including IDs and status) are rejected. Invalid input or an unavailable/non-member
target returns `400`; missing authentication returns `401`, and other roles return `403`.

Success returns `201` with `{ invitation: { id, trainerId, memberId, status, createdAt } }`,
where status is always `PENDING`. A pending invitation or an already accepted relationship
returns `409`. Rejected/revoked history remains stored and permits a new invitation;
different trainers may invite the same member. A transaction serializes creation per trainer,
and a partial unique index guarantees one pending invitation per pair even under concurrent writes.
Pending invitations grant no member-results or assignment permissions.

Apply `npm run db:migrate -w backend` before running the updated API. The partial unique
index is maintained in migration SQL because Prisma does not represent filtered indexes.
If existing data contains duplicate pending pairs, resolve those records before migration;
the migration intentionally does not delete invitation history.
Trainers can send invitations from the **Invitations** tab (#12). Enter the member email and submit; a successful response confirms **Pending**, awaiting member acceptance. Invalid recipients, duplicate or existing connections, denied access, and connection failures show retryable messages while preserving the entered email. The form prevents repeated submissions while sending and cancels requests when leaving the page. Member response/revocation flows are separate issues.


### Member invitation responses (#13)

Active `MEMBER` accounts can `GET /api/trainer-links` to list their own received
invitations, newest first (creation time, then ID). The response is `{ invitations }`,
including each link's `id`, `trainerId`, `memberId`, `status`, `createdAt`, and
`trainer: { id, displayName }`. All statuses remain visible; no invitations returns an
empty array. Query parameters are rejected (`400`); recipient identity comes from authentication.

`PATCH /api/trainer-links/:invitationId` accepts `{ "status": "ACCEPTED" }` or
`{ "status": "REJECTED" }`. Only the invited member may respond, and only while the
invitation is pending. Success returns `200 { invitation }` with the same fields as the
list. Invalid IDs/bodies return `400`, missing records `404`, another recipient `403`,
and an already answered/revoked invitation `409`. Concurrent responses have exactly
one winner. Accepting an inactive or non-trainer account is rejected (`409`); rejecting
its invitation remains possible. Trainers and admins cannot use these member endpoints.

Creation and response share a transaction lock per trainer so accepting cannot race
with creation of a second invitation. A conditional state update prevents later responses
from overwriting the first decision. Accepted links satisfy the existing consent checks;
rejected links grant no results or assignment access. Responses inherit the API's
`no-store` policy. No schema migration is needed. Members can manage these invitations in the **Invitations** tab (#14).


### Member invitation inbox (#14)

The **Invitations** tab shows members their received invitations with the trainer's
name, received date, and current status. Only pending invitations offer **Accept** and
**Reject**. A successful response displays the saved status and removes those actions.
Accepting explains the consent to results access and program assignments; rejecting
provides no access. Trainers retain the invitation creation form, and admins cannot
open either invitation screen.

Use **Refresh invitations** to fetch changes made elsewhere. Loading and empty inbox
states are explicit, and failed loads can be retried without discarding existing rows.
Response actions are disabled while saving. If saving fails or conflicts, the inbox
reloads authoritative statuses; if that read also fails, further responses remain disabled
until a successful refresh. Requests are canceled when leaving the screen. The inbox
uses authenticated API requests without storing invitations in browser storage.
Revocation is available for accepted collaborations in this inbox (#15–16).


### Trainer relationship revocation (#15)

An active linked `MEMBER` can send `PATCH /api/trainer-links/:invitationId` with
`{ "status": "REVOKED" }` to revoke an accepted relationship. Success returns
`200 { invitation }` with status `REVOKED`, also visible in the member's invitation
list. Only `ACCEPTED → REVOKED` is allowed; pending, rejected, already revoked,
and repeated revocations return `409`. Invalid IDs or bodies return `400`, missing
links `404`, other members/trainers/admins `403`, and missing/inactive sessions `401`.
The member may revoke even if the trainer has become inactive.

The conditional update and shared trainer transaction lock prevent competing requests
from overwriting the saved decision. Consent checks read current accepted links on each
request: after revocation commits, the trainer cannot access the member's results or
assign new programs. Future trainer result/assignment endpoints must use these checks.
Other accepted trainer relationships remain independent. A new invitation may be sent
after revocation and requires fresh acceptance to restore consent.

Revocation changes only the relationship status. Existing assignments, workout snapshots,
performed sets, notes, and completed history remain intact. Members retain their own
history/progress and may continue starting workouts from previously assigned programs.
No schema migration is needed. Members can use the confirmation and revoke control below (#16).


### Collaboration revocation control (#16)

In the member **Invitations** tab, accepted relationships offer **Revoke collaboration**.
An inline confirmation names the trainer and explains the loss of results access and new
assignment rights while keeping existing programs and workout history available. **Cancel**
or Escape dismisses confirmation without a request and returns focus to the revoke button.
Only **Confirm revocation** sends the authenticated status update.

After saving, the relationship displays **Revoked** and no longer offers actions. Other
collaborations and the member's program, workout, history, and progress navigation remain
available. Saving disables repeated requests. A failure refreshes the saved relationship
status; if verification also fails, actions remain disabled until a successful refresh.
Retrying an accepted relationship requires confirmation again. Leaving the screen cancels
pending requests. No backend or schema changes are required for this control.

### Trainer program assignments (#21)

`POST /api/assignments` requires an active authenticated `TRAINER` and a strict body
`{ "programId": "<uuid>", "memberId": "<uuid>" }`. Only the trainer's own program
may be assigned, and the recipient must be an active `MEMBER` with an `ACCEPTED`
relationship to that trainer. Missing authentication returns `401`, denied roles,
foreign programs or unavailable/unrelated recipients `403`, invalid input `400`, and
a missing program `404`. Caller-supplied assigning identities or timestamps are rejected.

Success returns `201 { assignment: { id, programId, memberId, assignedById, assignedAt } }`.
The assigning trainer and timestamp are set by the server. Repeating the same
program/member/trainer assignment returns `200` with the original record and timestamp;
concurrent retries are serialized. Different programs and accepted recipients may be
assigned independently. Existing historical duplicate rows are not deleted.

Assignment creation shares the trainer transaction lock used by relationship changes,
and checks ownership/consent inside that transaction. If revocation commits first, the
assignment is denied; if assignment commits first, it remains accessible to the member
after revocation. Even a retry must pass current consent checks. Future assignment
creation entry points must follow the same locking protocol.

Assigned programs and their days appear in the member's existing **Workout** choices.
Assignment grants the ability to train from a program, not edit it. Existing assignments
and completed workout data survive relationship revocation. No schema migration is
needed. Trainer and member assignment views are available in #22.


### Assignment and assigned-program views (#22)

Trainers can open **Assignments**, choose one of their own programs and an accepted
active member, and submit the assignment. Success confirms the program, member, and
saved timestamp. Failed submissions preserve choices for retry; repeating the same
assignment reuses the existing record. **Refresh choices** reloads access and removes
recipients whose consent has changed. Empty states link to program creation or invitations.

`GET /api/assignments/options` supplies `{ programs, members }` to authenticated trainers.
Programs expose only `id`, `name`, `description` and belong to the caller. Members expose
`id`, `displayName`, `email`, restricted to active `MEMBER` accounts with an accepted
link to the caller, once per member. Other roles receive `403`; unauthenticated calls
receive `401`; query parameters are rejected (`400`). Assignment POST rechecks current
permissions, so stale selector data cannot bypass consent checks.

Members see **Assigned programs** in navigation (`#assignments`), showing only assigned
programs from their authenticated workout options, with numbered days and expandable
planned exercises/targets. The view is read-only and links to **Workout** to select a day
and start. Members retain these assignments when trainer collaboration is revoked; own
programs remain in **My programs**. Loading, empty, error, and refresh states are provided.
Admins cannot access the assignment screens. No schema migration is needed.

## Trainer member results

US-16 backend (#33) provides read-only results for an active member linked to the
current trainer with status `ACCEPTED`:

| Method | Path | Response |
|---|---|---|
| GET | `/api/trainer/members/:memberId/workout-sessions/history?limit=20&cursor=<id>` | `{ workouts, nextCursor }` |
| GET | `/api/trainer/members/:memberId/workout-sessions/history/:sessionId` | `{ workout }` |
| GET | `/api/trainer/members/:memberId/progress/exercises` | `{ exercises }` |
| GET | `/api/trainer/members/:memberId/progress/:exerciseId` | `{ exercise, points }` |

The existing `/api/assignments/options` endpoint supplies accepted member choices.
Results use the same pagination, frozen workout labels, actual saved sets and
per-completed-workout maximum weights as the personal history/progress endpoints.
Personal endpoints continue to select the authenticated user's own results.

Every member-scoped request rechecks the current relationship, including later pages.
Missing, pending, rejected or revoked links and inactive members return `403`.
Anonymous requests return `401`; members and admins return `403`. Malformed IDs and
invalid pagination or unsupported filters return `400`. Missing exercises/workouts
and non-completed detail records return `404`; a workout belonging to a different
member returns `403`. Responses are `no-store`.

These routes expose no writes. An accepted link never grants permission to start,
record sets for, or complete a member's workout; existing write APIs retain owner
checks. Revocation leaves the member's own saved results intact. No migration is needed.

## Trainer member results views

US-16 frontend (#34) replaces the trainer **Member results** placeholder. At `/#members`,
choose an accepted member to open their completed workout history or exercise progress.
Member-scoped links support direct navigation to
`/#members/:memberId/history`, `/#members/:memberId/history/:sessionId` and
`/#members/:memberId/progress`. Details show actual saved sets and notes; charts and
workout-value links stay within the selected member's history. These views expose no
workout recording, starting or completion actions.

Member choices refresh on navigation, window focus, returning to a visible tab, or
**Refresh members**. Refreshing clears displayed results while access is checked.
A forbidden result request removes the entire results view and explains that access
is no longer available. Switching members cancels pending reads and discards previous
results. Empty choices, empty results and request failures have explicit states and
retry controls. Members and admins cannot open these routes.

Sign-up includes an optional **Register as a trainer** checkbox. It defaults to unchecked.
`POST /api/auth/register` accepts `registerAsTrainer: true` for a trainer account;
omitting it or sending `false` creates a member. Arbitrary `role` and `isActive` inputs
remain rejected. No database migration is required.
