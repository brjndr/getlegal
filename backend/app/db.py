import os
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    -- Empty until real sign up and sign in exist.
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def db_path() -> Path:
    default = Path(tempfile.gettempdir()) / "prelegal.db"
    return Path(os.environ.get("DB_PATH", default))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Creates an empty database, discarding any data from a previous run."""
    db_path().unlink(missing_ok=True)
    with closing(_connect()) as conn, conn:
        conn.execute(SCHEMA)


def upsert_user(email: str) -> dict:
    """Returns the user with this email, creating it on first sight."""
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO users (email) VALUES (?) ON CONFLICT (email) DO NOTHING", (email,)
        )
        row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row)
