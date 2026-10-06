import os
import re
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from app import chat, converse, db

# Picks up the API key from the repo's .env when running outside the container.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


class LoginRequest(BaseModel):
    email: str
    # Accepted so the request has its final shape, but not checked: there is no authentication yet.
    password: str = ""

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL.fullmatch(email):
            raise ValueError("Enter a valid email address")
        return email


class User(BaseModel):
    id: int
    email: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


@contextmanager
def _chat_errors():
    """Turns a failure of the assistant into a response the chat can show."""
    try:
        yield
    except chat.ChatUnavailable:
        raise HTTPException(503, "The assistant isn’t set up yet: OPENROUTER_API_KEY is missing.")
    except chat.ChatFailed:
        raise HTTPException(502, "The assistant couldn’t reply just now. Please try again.")


def create_app(static_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Prelegal", lifespan=lifespan)

    # Only for local development, where the frontend runs on its own port.
    origins = [origin for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin]
    if origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"]
        )

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/login")
    def login(request: LoginRequest) -> User:
        return User(**db.upsert_user(request.email))

    @app.post("/api/chat", response_model_exclude_none=True)
    def send_chat(request: chat.ChatRequest) -> chat.ChatResponse:
        with _chat_errors():
            return chat.respond(request)

    @app.post("/api/draft", response_model_exclude_none=True)
    def send_draft(request: converse.DraftRequest) -> converse.DraftResponse:
        with _chat_errors():
            return converse.respond(request)

    static_dir = static_dir or Path(os.environ.get("STATIC_DIR", "static"))
    if static_dir.is_dir():
        # Mounted last so the API routes above take precedence.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()
