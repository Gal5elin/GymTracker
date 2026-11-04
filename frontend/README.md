# GymTracker UI prototype

Implements issue #37 using `docs/wireframes/DESIGN.md` and the screen images as visual guidance. All application copy is in English. The interface keeps the neutral palette, sharp borders and clear hierarchy, while adapting the screen layouts for smaller displays.

## Preview

From the repository root:

```sh
npm run dev -w frontend
```

Open http://localhost:5173. Login, API and database are not required for this prototype.

Try **Start workout → View program → Start this workout → Save a set → Finish workout**. The completed summary opens immediately, and the session also appears in History, Overview and Progress. Bodyweight movements accept a blank weight. Saved sets and completed workouts are read-only.

The prototype uses typed, in-memory sample data. All changes reset on refresh; no personal data is sent to the API or saved in browser storage. A production build is also a demo, not an authenticated application. `WorkoutService` in `src/data/workouts.ts` is the boundary to replace when connecting the real API. Notes survive navigation within the current page session.

Additional states can be reviewed with:

- `http://localhost:5173/?demo=empty`: no completed workouts; programs remain available.
- `http://localhost:5173/?demo=error`: initial loading failure; **Try again** recovers.
- Loading feedback is shown during sample data operations.

## Verification

```sh
npm run typecheck -w frontend
npm run build -w frontend
npm run test -w frontend
```

Vitest checks the full sample data lifecycle, invalid input, duplicate sets, completed-workout locking, snapshot isolation and loading retry. No browser automation dependency is required. Manually review the responsive layout at 375px and 1440px, keyboard navigation, and the complete logging flow.

## Deliberately deferred wireframe controls

The following need separate requirements or their existing feature issues:

- Editing/deleting saved sets and discarding workouts: define correction and cancellation behavior first.
- Draft persistence, resume after refresh, autosave and offline operation: the demo is memory-only.
- Rest timers, exercise images/video, RPE and volume metrics: outside this UI foundation.
- Creating/editing programs: #17–#20; sample program/day selection is implemented here.
- Authentication and role navigation: #5–#10.
- Real workout start, recording, completion and history: #23–#30.
- Real progress data: #31–#32; the preview computes maximum weight from completed sample sessions.
- Trainer invitations, messaging, trainer notes and advanced reports: omitted from this member logging prototype.

The UI does not present inactive buttons for these deferred functions.
