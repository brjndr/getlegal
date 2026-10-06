# getlegal
A platform for drafting common legal agreements

## Status

This project is in progress and is expected to be completed in 1 week (by 11 October 2026).

## Running

You need [Docker](https://docs.docker.com/get-docker/) and an
[OpenRouter](https://openrouter.ai/) API key for the AI chat. Copy `.env.example`
to `.env` and put the key in it. Then start the app with the script for your
system and open http://localhost:8000.

| | Start | Stop |
|---|---|---|
| Mac | `scripts/start-mac.sh` | `scripts/stop-mac.sh` |
| Linux | `scripts/start-linux.sh` | `scripts/stop-linux.sh` |
| Windows | `scripts\start-windows.ps1` | `scripts\stop-windows.ps1` |

Sign in with any email address. There is no authentication yet, so the
password is not checked. The database is temporary: it starts empty every time
the app starts.

You draft an agreement by chatting with an AI assistant. Tell it what you
need and it picks one of the 11 document types in `catalog.json`, or says so when
it can't draft what you asked for and offers the closest one. It then asks
about the agreement and fills in the document beside the chat as you answer.
**Download PDF** saves the agreement as a PDF file. Without an API key the app
still starts, but the assistant says it isn't set up.

## How it fits together

Everything runs in one container, built by the `Dockerfile`:

- `frontend/` is a Next.js app, built into static files.
- `backend/` is a FastAPI app. It serves the API under `/api` and the built
  frontend everywhere else, and keeps users in a SQLite database.
- The chat sends each message to a language model through OpenRouter, with
  Cerebras as the provider. The model returns the values the user gave, and
  the backend works out what is left to ask, so every reply ends with the next
  question until nothing is missing. Nothing about a conversation is stored:
  the browser sends the conversation and the current document with every
  message.
- The Mutual NDA has its own chat (`backend/app/chat.py`, `POST /api/chat`).
  The other documents, and choosing a document in the first place, go through
  `backend/app/converse.py` (`POST /api/draft`).
- `templates/` holds the agreement text, listed in `catalog.json`.
- `documents/specs.json` describes each document: its parties, the fields the
  assistant asks about, and the template variables each field fills. The
  backend and the frontend build both read it. To change what is asked for a
  document, edit its entry there. Tests fail if an entry and its template's
  variables stop matching.

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

The backend reads the API key from `.env` in the repo root. The tests never
call the model, so they need no key.

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
