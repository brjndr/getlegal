# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports all 11 document types via AI chat with full user authentication and document persistence.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Implementation status

Updated 6 October 2026, after GL-5.

Done:
- GL-2: the 12 templates in `templates/`, listed in `catalog.json`.
- GL-3: Mutual NDA creator with a live document preview and PDF download through the browser's print dialog.
- GL-4: V1 foundation. FastAPI backend in `backend/` (uv), Next.js frontend built as a static export and served by FastAPI, SQLite with a `users` table recreated on every start, one Docker container run by the scripts in `scripts/`, and CI for the backend, the frontend and the container.
- GL-5: AI chat for the Mutual NDA. `POST /api/chat` (`backend/app/chat.py`) follows the Cerebras skill with Structured Outputs; `frontend/components/nda-chat.tsx` replaced the form. PR #7, not yet merged.

Not built yet:
- Only the Mutual NDA can be drafted. The other templates are not wired up.
- The login is fake: `/login` accepts any email, the password is not checked, and the API is unauthenticated.
- No document persistence. A conversation lives in the browser and is lost on reload.

Worth knowing:
- The backend, not the model, decides which question to ask next (`open_questions` in `chat.py`). The model loses track of which defaults the user has confirmed.
- LLM calls must set `allow_fallbacks: False` and `max_tokens`. Otherwise OpenRouter can silently switch provider and return corrupted fields. The Cerebras skill shows both.
- Backend tests replace the model with a fake, so they need no API key and never reach the network.
- The frontend is a static export, so nothing in it may need a Next.js server at run time.
