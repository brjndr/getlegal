import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from app import db

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

    static_dir = static_dir or Path(os.environ.get("STATIC_DIR", "static"))
    if static_dir.is_dir():
        # Mounted last so the API routes above take precedence.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()
