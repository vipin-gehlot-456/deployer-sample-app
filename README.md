# Sample Task Manager

A small task list app to try the **Deployment Automation** platform (the "Deployer") on a real
server. It has the exact shape the Deployer supports:

- **Frontend:** React, built with Vite (`client/`).
- **Backend:** Node.js with Express 5 (`server/`).
- **Database:** PostgreSQL, with a migration script.
- npm workspaces, an npm lockfile and Node 24.

## What the app does

- Shows a list of tasks and lets you add new ones.
- `GET /api/tasks` and `POST /api/tasks` read and write the tasks in PostgreSQL.
- `GET /api/health/live` says the process is running.
- `GET /api/health/ready` says the app is ready: it runs `SELECT 1` on the database (2 second limit)
  and answers 503 when the database is missing or down. The Deployer uses it before it sends traffic
  to a new version.

## How it fits the Deployer

| Rule | Where in this app |
|---|---|
| Reads `HOST` and `PORT` from the environment | `server/src/index.js` (defaults `127.0.0.1` and `3000`) |
| All API routes under `/api` | `server/src/index.js` |
| A health URL | `/api/health/ready` |
| Schema changes by one command | `npm run db:migrate` (uses `MIGRATION_DATABASE_URL`, else `DATABASE_URL`) |
| Secrets from files | `<KEY>_FILE=/path/to/file` is read by `server/load-secrets.cjs` before the app starts |
| Required and optional variables | `deployer.json` and `.env.example` |
| Node 24 | `.nvmrc` and `engines` in `package.json` |

`SERVE_STATIC=1` makes the API also serve `client/dist` (used by the single-image Docker mode).
`Dockerfile` and `compose.yaml` are for the Deployer's Docker method (a later milestone).
`docker-compose.yml` only starts a local database for development.

## Run it on your computer

You need Node 24 and a PostgreSQL database. The commands are for Git Bash, macOS or Linux.

```sh
npm ci
# Start a local database with Docker (or use any PostgreSQL you have):
export POSTGRES_PASSWORD=change-me-local
docker compose -f docker-compose.yml up -d
export DATABASE_URL="postgres://tasks:${POSTGRES_PASSWORD}@127.0.0.1:5432/tasks"
npm run db:migrate
npm start        # API on http://127.0.0.1:3000
npm run dev      # in a second terminal: the web app on http://localhost:5173 (sends /api to the API)
npm test
```

## Deploy it with the Deployer

1. Set up the Deployer's GitHub App and AWS connection by following its guide
   `docs/setup-connections.md`. Install the GitHub App on **this repository only**.
2. In the Deployer, create a project and pick this repository and the `main` branch, then click
   **Check Repository**. It should find these values by itself:

   | Setting | Value |
   |---|---|
   | Deployment method | Node.js + PM2 |
   | Frontend folder | `client` |
   | Backend folder | `server` |
   | Build script | `build` |
   | Start script | `start` |
   | Frontend output folder | `client/dist` |
   | Backend port | `3000` |
   | Health URL | `/api/health/ready` |
   | Migration script | `db:migrate` |

3. In the **Variables** step, give values for the keys in `.env.example`. `deployer.json` marks
   `DATABASE_URL` and `SESSION_SECRET` as required, so the Deployer will not deploy without them. Keep
   them as backend secrets. The app does not use `SESSION_SECRET` yet; it is there to show how a
   required variable works. Only `VITE_APP_TITLE` is public (it becomes part of the browser code).
4. Review the plan and click **Deploy**.

Never commit a real `.env` file. It is listed in `.gitignore`.
