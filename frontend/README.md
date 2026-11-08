# GymTracker UI prototype

Implements issue #37 using `docs/wireframes/DESIGN.md` and the screen images as visual guidance. All application copy is in English. The interface keeps the neutral palette, sharp borders and clear hierarchy, while adapting the screen layouts for smaller displays.

## Preview

From the repository root:

```sh
npm run dev -w frontend
```

Open http://localhost:5173 to register a real member account. Start the API and database using the root README first. Configure `VITE_API_URL` in `frontend/.env` if the API is not at `http://localhost:3000`.

Registration shows field validation, duplicate-email errors, retryable failures and account-creation confirmation. It does not log in automatically; use **Sign in** after creating an account.

Open http://localhost:5173/#login to sign in. Login keeps the JWT only in memory and opens the shared application shell backed by `GET /api/auth/me`. Requests made through `src/api/auth.ts` attach the bearer token automatically; expired or rejected tokens clear the session and require another login. Refreshing the page requires signing in again. Credentials and tokens are never saved to browser storage. Failed login and connection errors allow retry. Use **Sign out** on the account page to clear the in-memory session and return to login. Pending login responses cannot restore a session after logout. Navigation follows the current role returned by the API: members see personal sections; trainers also see invitations, assignments and member results; admins see an administration overview without private workout sections.

Protected links (including `#account`) redirect to `#login` without a valid in-memory session. Browser Back/Forward, restored pages and session expiry recheck authentication; logout replaces the current account URL with login. Unknown routes cannot open the workout prototype. Allowed workspace routes now open role-specific sections. Features awaiting their APIs show a coming-soon state with no sample records. A direct link to a section outside the current role shows Access denied. The independent demo reuses the same shell and retains its sample data.

Use **Explore the workout demo** or open http://localhost:5173/#demo/dashboard for the independent prototype. Login, API and database are not required for that demo.

Try **Start workout → View program → Start this workout → Save a set → Finish workout**. The completed summary opens immediately, and the session also appears in History, Overview and Progress. Bodyweight movements accept a blank weight. Saved sets and completed workouts are read-only.

The prototype uses typed, in-memory sample data. All changes reset on refresh; no personal data is sent to the API or saved in browser storage. A production build is also a demo, not an authenticated application. `WorkoutService` in `src/data/workouts.ts` is the boundary to replace when connecting the real API. Notes survive navigation within the current page session.

Additional states can be reviewed with:

- `http://localhost:5173/?demo=empty#demo/dashboard`: no completed workouts; programs remain available.
- `http://localhost:5173/?demo=error#demo/dashboard`: initial loading failure; **Try again** recovers.
- Loading feedback is shown during sample data operations.

## Verification

```sh
npm run typecheck -w frontend
npm run build -w frontend
npm run test -w frontend
```

Vitest checks login, in-memory sessions, authenticated requests, expiry, rejection and retry, plus registration submission, validation, duplicate-email feedback, failures and retry, plus the full sample data lifecycle, invalid input, duplicate sets, completed-workout locking, snapshot isolation and loading retry. No browser automation dependency is required. Manually review the responsive layout at 375px and 1440px, keyboard navigation, and the complete logging flow.

## Deliberately deferred wireframe controls

The following need separate requirements or their existing feature issues:

- Editing/deleting saved sets and discarding workouts: define correction and cancellation behavior first.
- Draft persistence, resume after refresh, autosave and offline operation: the demo is memory-only.
- Rest timers, exercise images/video, RPE and volume metrics: outside this UI foundation.
- Creating/editing programs: #17–#20; sample program/day selection is implemented here.
- Authentication, logout, protected routing and role navigation are connected to the real API (#5–#10).
- Real workout start, recording, completion and history: #23–#30.
- Real progress data: #31–#32; the preview computes maximum weight from completed sample sessions.
- Trainer invitations, messaging, trainer notes and advanced reports: omitted from this member logging prototype.

The UI does not present inactive buttons for these deferred functions.
