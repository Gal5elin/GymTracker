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

Open http://localhost:5173 to try the workout logging UI with sample data. The prototype runs independently of the API; start just the frontend with `npm run dev -w frontend`. See [frontend/README.md](frontend/README.md) for the demo flow and its limitations. The API still provides `GET http://localhost:3000/api/health` for availability checks; it does not query PostgreSQL. Stop development servers with Ctrl+C.

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

## Local seed accounts

| Email | Role |
| --- | --- |
| member@gymtracker.local | MEMBER |
| trainer@gymtracker.local | TRAINER |
| admin@gymtracker.local | ADMIN |

All use `SEED_PASSWORD` from `backend/.env` (example: `GymTracker-dev-123!`). Passwords are stored as Argon2id hashes. Seeding upserts accounts by email and six exercises by stable UUID, so rerunning it creates no duplicates. It resets demo account passwords/roles and the seeded catalog values. The seed is refused when `NODE_ENV=production`. Login endpoints are future feature work.

## Structure

- `frontend/`: React, TypeScript, Vite, Tailwind CSS; Recharts installed for progress views.
- `backend/src/`: Express app, environment validation, server and API smoke tests. Zod, JWT and Argon2id are installed for upcoming features.
- `backend/prisma/`: documented MVP data model, initial SQL migration, development seed.
- `docs/`: scope, user stories, architecture and data model.

Unique keys, foreign keys and numeric checks are enforced in PostgreSQL. Role/ownership permissions, accepted trainer links, assignment consistency and workout completion rules require service logic in the feature issues. Historical references use restrictive deletion to preserve workout records.
