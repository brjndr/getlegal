# getlegal
A platform for drafting common legal agreements

## Status

This project is in progress and is expected to be completed in 1 week (by 11 October 2026).

## Running

You need [Docker](https://docs.docker.com/get-docker/). Start the app with the
script for your system, then open http://localhost:8000.

| | Start | Stop |
|---|---|---|
| Mac | `scripts/start-mac.sh` | `scripts/stop-mac.sh` |
| Linux | `scripts/start-linux.sh` | `scripts/stop-linux.sh` |
| Windows | `scripts\start-windows.ps1` | `scripts\stop-windows.ps1` |

Sign in with any email address. There is no authentication yet, so the
password is not checked. The database is temporary: it starts empty every time
the app starts.

## How it fits together

Everything runs in one container, built by the `Dockerfile`:

- `frontend/` is a Next.js app, built into static files.
- `backend/` is a FastAPI app. It serves the API under `/api` and the built
  frontend everywhere else, and keeps users in a SQLite database.
- `templates/` holds the agreement text, listed in `catalog.json`.

## Developing

Run the backend and the frontend separately to get live reloading. The
frontend at http://localhost:3000 then calls the backend at
http://localhost:8000.

```bash
cd backend
CORS_ORIGINS=http://localhost:3000 uv run uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

On Windows, set the variable first with `$env:CORS_ORIGINS = "http://localhost:3000"`.

## Checks

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

```bash
cd frontend
npm test
npm run lint
npm run build
```
