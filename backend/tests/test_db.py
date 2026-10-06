import sqlite3

import pytest

from app import db


def test_init_db_creates_an_empty_users_table(database):
    db.init_db()

    with sqlite3.connect(database) as conn:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    assert columns == ["id", "email", "password_hash", "created_at"]
    assert count == 0


def test_init_db_discards_data_from_a_previous_run():
    db.init_db()
    first = db.upsert_user("ada@example.com")
    db.upsert_user("grace@example.com")

    db.init_db()

    assert db.upsert_user("grace@example.com")["id"] == first["id"]


def test_upsert_user_creates_a_user_once():
    db.init_db()

    created = db.upsert_user("ada@example.com")
    again = db.upsert_user("ada@example.com")
    other = db.upsert_user("grace@example.com")

    assert created == {"id": 1, "email": "ada@example.com"}
    assert again == created
    assert other["id"] != created["id"]


def test_users_cannot_share_an_email(database):
    db.init_db()
    db.upsert_user("ada@example.com")

    with sqlite3.connect(database) as conn, pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO users (email) VALUES ('ada@example.com')")
