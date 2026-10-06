import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    -- A hash of the token in the user's cookie, so that reading this table signs nobody in.
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);

CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Which document it is, e.g. "mutual-nda".
    document TEXT NOT NULL,
    -- The companies it is between, for the list of documents.
    parties TEXT NOT NULL,
    -- The agreement and its conversation, as JSON.
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX documents_by_user ON documents (user_id, updated_at DESC);
"""

SUMMARY = "id, document, parties, updated_at"


def db_path() -> Path:
    default = Path(tempfile.gettempdir()) / "prelegal.db"
    return Path(os.environ.get("DB_PATH", default))


def now() -> str:
    """The time in UTC, in a form that sorts by time and that a browser can read."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    # Off by default in SQLite. Deleting a user takes their sessions and documents along.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Creates an empty database, discarding any data from a previous run."""
    db_path().unlink(missing_ok=True)
    with closing(_connect()) as conn, conn:
        conn.executescript(SCHEMA)


def create_user(email: str, password_hash: str) -> dict | None:
    """Returns the new user, or None when the email already has an account."""
    with closing(_connect()) as conn, conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, password_hash)
            )
        except sqlite3.IntegrityError:
            return None
    return {"id": cursor.lastrowid, "email": email}


def find_user(email: str) -> dict | None:
    """The user with this email, with the hash of their password."""
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
    return dict(row) if row else None


def create_session(token_hash: str, user_id: int, expires_at: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, expires_at),
        )


def session_user(token_hash: str) -> dict | None:
    """The user this session belongs to, unless it has expired."""
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id"
            " WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            (token_hash, now()),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token_hash: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


# Every query below names the user, so nobody can reach a document that is not theirs.


def list_documents(user_id: int) -> list[dict]:
    """The user's documents without their contents, the latest first."""
    with closing(_connect()) as conn:
        rows = conn.execute(
            f"SELECT {SUMMARY} FROM documents WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_document(user_id: int, document_id: int) -> dict | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            f"SELECT {SUMMARY}, state FROM documents WHERE id = ? AND user_id = ?",
            (document_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def add_document(user_id: int, document: str, parties: str, state: str) -> dict:
    """Saves a new document and returns its summary."""
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "INSERT INTO documents (user_id, document, parties, state, updated_at)"
            f" VALUES (?, ?, ?, ?, ?) RETURNING {SUMMARY}",
            (user_id, document, parties, state, now()),
        ).fetchone()
    return dict(row)


def update_document(
    user_id: int, document_id: int, document: str, parties: str, state: str
) -> dict | None:
    """Replaces a saved document and returns its summary, or None when the user has no such one."""
    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "UPDATE documents SET document = ?, parties = ?, state = ?, updated_at = ?"
            f" WHERE id = ? AND user_id = ? RETURNING {SUMMARY}",
            (document, parties, state, now(), document_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def delete_document(user_id: int, document_id: int) -> bool:
    """Returns whether the user had such a document."""
    with closing(_connect()) as conn, conn:
        cursor = conn.execute(
            "DELETE FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id)
        )
    return cursor.rowcount == 1
