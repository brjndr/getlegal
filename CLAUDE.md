# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports all 11 document types via AI chat, with PDF download. User authentication and document persistence are not built yet: the login accepts any email, and a draft is lost on reload. See "Implementation status" below.

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

Updated 6 October 2026, after GL-6.

Done:
- GL-2: the 12 templates in `templates/`, listed in `catalog.json`.
- GL-3: Mutual NDA creator with a live document preview.
- GL-4: V1 foundation. FastAPI backend in `backend/` (uv), Next.js frontend built as a static export and served by FastAPI, SQLite with a `users` table recreated on every start, one Docker container run by the scripts in `scripts/`, and CI for the backend, the frontend and the container.
- GL-5: AI chat for the Mutual NDA. `POST /api/chat` (`backend/app/chat.py`) follows the Cerebras skill with Structured Outputs. PR #7, merged.
- GL-6: all 11 document types. The chat picks the document, and for a request it cannot draft it says so and offers the closest one. `POST /api/draft` (`backend/app/converse.py`) chooses the document and drafts every document except the Mutual NDA, which keeps `/api/chat`. Also in GL-6: Download PDF saves a PDF file (pdfmake, in the browser) instead of opening the print dialog, the cursor returns to the message box after each reply, and every reply ends with a question while anything is still open. On branch `GL-6`, PR not yet merged.

Not built yet:
- The login is fake: `/login` accepts any email, the password is not checked, and the API is unauthenticated.
- No document persistence. A conversation lives in the browser and is lost on reload.

Worth knowing:
- `documents/specs.json` is the single description of each document: parties, fields, the question for each field, and the template variables each field fills. The backend reads it at run time and the frontend at build time. Tests on both sides fail if an entry and its template's variables stop matching.
- The backend, not the model, decides which question to ask next (`open_questions` in `chat.py` for the Mutual NDA and in `documents.py` for the rest). The model loses track of what has been settled. `close_reply` in `chat.py` ends every reply with a question while anything is open.
- A document switch is a round trip: the endpoint answers with `document` and nothing else, and the frontend (`draft-chat.tsx`) starts that document empty and sends the same message again with `fresh: true`. Only messages since the switch are sent afterwards.
- Only the Mutual NDA has a cover page template. For the others the cover page is generated from the spec. In the Standard Terms the parties' names replace their roles, and every other value is shown beside its term, as in "the Effective Date (October 6, 2026)".
- LLM calls must set `allow_fallbacks: False` and `max_tokens`. Otherwise OpenRouter can silently switch provider and return corrupted fields. The Cerebras skill shows both.
- Backend tests replace the model with a fake, so they need no API key and never reach the network.
- The frontend is a static export, so nothing in it may need a Next.js server at run time. The other documents' text is written to `out/templates.json` at build time and fetched by the page.
