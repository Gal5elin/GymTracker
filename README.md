# GymTracker

Plan workouts, record sets, and track progress. Trainers can assign programs and review results for members who accept their invitation.

Built with React, TypeScript, Express, Prisma, and PostgreSQL.

## Run locally

**Requirements:** Node.js 22.12+, npm, and Docker with Compose.

### 1. Install and configure

From the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set `JWT_SECRET` in `backend/.env` to a random secret of at least 32 characters. You can generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### 2. Set up the database

Start Docker, then run:

```sh
npm run db:generate
npm run db:up
npm run db:migrate
npm run db:seed
```

If port `5432` is occupied, create a root `.env` file containing `POSTGRES_PORT=5433` and change the port in both database URLs in `backend/.env` to `5433`.

### 3. Start the app

```sh
npm run dev
```

Open **[localhost:5173](http://localhost:5173)**. The API runs at `http://localhost:3000`. Use `localhost` for both services.

Create an account, optionally checking **Register as a trainer**, or sign in with a seeded account:

| Account | Email |
| --- | --- |
| Member | `member@gymtracker.local` |
| Trainer | `trainer@gymtracker.local` |
| Admin | `admin@gymtracker.local` |

Seeded accounts use `SEED_PASSWORD` from `backend/.env` (default: `GymTracker-dev-123!`).

### Next time

```sh
npm run db:up
npm run db:migrate
npm run dev
```

After pulling schema changes, also run `npm run db:generate`. Stop the app with `Ctrl+C`; use `npm run db:down` to stop PostgreSQL while keeping its data.

## Development

| Command | Purpose |
| --- | --- |
| `npm test` | Run unit and component tests |
| `npm run typecheck` | Check TypeScript |
| `npm run build` | Build both apps |

Project design and architecture are in [docs](docs/).
