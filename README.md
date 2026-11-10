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
Registration always creates an active `MEMBER`; unknown fields, including client-supplied roles, are rejected.
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
returns to launch choices. History APIs are available in #29; the History tab follows in #30. Unsaved notes
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
separate trainer-read endpoints remain in their own issues. Existing assigned-workout history stays
with the recipient after collaboration ends. Missing login returns `401`, non-owners/admins `403`,
invalid IDs `400`, and missing or non-completed history details `404`. Responses are `no-store`.
There are no history write endpoints and no schema migration. The connected History tab is #30.

## Server permissions

`backend/src/permissions.ts` provides role middleware and database-backed checks for program/day
ownership, workout ownership, private results access, accepted trainer links and trainer assignments.
Unauthorized actions return JSON `403`; missing authentication returns `401`. Trainers retain personal
member functions. Administrators have no override for private results, workout recording or personal
programs/assignments. Registration still rejects supplied roles and creates only active members.

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
