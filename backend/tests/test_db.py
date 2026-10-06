import sqlite3

import pytest

from app import db


@pytest.fixture(autouse=True)
def empty_database():
    db.init_db()


@pytest.fixture
def ada():
    return db.create_user("ada@example.com", "hash")["id"]


@pytest.fixture
def grace():
    return db.create_user("grace@example.com", "hash")["id"]


def test_init_db_creates_empty_tables(database):
    with sqlite3.connect(database) as conn:
        tables = {
            table: [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
            for table in ["users", "sessions", "documents"]
        }
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    assert tables == {
        "users": ["id", "email", "password_hash", "created_at"],
        "sessions": ["token_hash", "user_id", "expires_at"],
        "documents": ["id", "user_id", "document", "parties", "state", "updated_at"],
    }
    assert count == 0


def test_init_db_discards_data_from_a_previous_run(ada):
    db.add_document(ada, "csa", "", "{}")
    db.create_session("token", ada, "9999")

    db.init_db()

    assert db.find_user("ada@example.com") is None
    assert db.session_user("token") is None
    assert db.create_user("grace@example.com", "hash")["id"] == ada


def test_create_user_saves_the_user_with_the_hash_of_their_password():
    created = db.create_user("ada@example.com", "hash")

    assert created == {"id": 1, "email": "ada@example.com"}
    assert db.find_user("ada@example.com") == {**created, "password_hash": "hash"}


def test_create_user_refuses_an_email_that_has_an_account(ada):
    assert db.create_user("ada@example.com", "other") is None
    assert db.find_user("ada@example.com")["password_hash"] == "hash"


def test_find_user_knows_nobody_by_an_unused_email(ada):
    assert db.find_user("grace@example.com") is None


def test_a_session_belongs_to_its_user_until_it_expires(ada, monkeypatch):
    db.create_session("token", ada, "2026-10-07T00:00:00+00:00")

    monkeypatch.setattr(db, "now", lambda: "2026-10-06T23:59:59+00:00")
    assert db.session_user("token") == {"id": ada, "email": "ada@example.com"}
    assert db.session_user("another") is None

    monkeypatch.setattr(db, "now", lambda: "2026-10-07T00:00:00+00:00")
    assert db.session_user("token") is None


def test_a_deleted_session_no_longer_signs_the_user_in(ada):
    db.create_session("token", ada, "9999")
    db.create_session("other", ada, "9999")

    db.delete_session("token")

    assert db.session_user("token") is None
    assert db.session_user("other") is not None


def test_creating_a_session_clears_out_the_expired_ones(ada, database, monkeypatch):
    db.create_session("old", ada, "2026-10-06T00:00:00+00:00")
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T00:00:01+00:00")

    db.create_session("new", ada, "2026-11-06T00:00:00+00:00")

    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT token_hash FROM sessions").fetchall() == [("new",)]


def test_a_saved_document_can_be_read_back(ada, monkeypatch):
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T10:00:00+00:00")

    summary = db.add_document(ada, "csa", "Acme and Globex", '{"a": 1}')

    assert summary == {
        "id": 1,
        "document": "csa",
        "parties": "Acme and Globex",
        "updated_at": "2026-10-06T10:00:00+00:00",
    }
    assert db.get_document(ada, 1) == {**summary, "state": '{"a": 1}'}
    assert db.list_documents(ada) == [summary]


def test_documents_are_listed_with_the_latest_change_first(ada, monkeypatch):
    times = iter(["2026-10-06T10:00:00+00:00"] * 2 + ["2026-10-06T11:00:00+00:00"])
    monkeypatch.setattr(db, "now", lambda: next(times))
    first = db.add_document(ada, "csa", "", "{}")["id"]
    second = db.add_document(ada, "psa", "", "{}")["id"]
    assert [row["id"] for row in db.list_documents(ada)] == [second, first]

    db.update_document(ada, first, "csa", "Acme", "{}")

    assert [row["id"] for row in db.list_documents(ada)] == [first, second]


def test_update_document_replaces_what_was_saved(ada, monkeypatch):
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T10:00:00+00:00")
    saved = db.add_document(ada, "csa", "", "{}")["id"]
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T11:00:00+00:00")

    summary = db.update_document(ada, saved, "csa", "Acme", '{"a": 1}')

    assert summary == {
        "id": saved,
        "document": "csa",
        "parties": "Acme",
        "updated_at": "2026-10-06T11:00:00+00:00",
    }
    assert db.get_document(ada, saved) == {**summary, "state": '{"a": 1}'}


def test_delete_document_removes_it(ada):
    saved = db.add_document(ada, "csa", "", "{}")["id"]
    kept = db.add_document(ada, "psa", "", "{}")["id"]

    assert db.delete_document(ada, saved) is True

    assert db.get_document(ada, saved) is None
    assert [row["id"] for row in db.list_documents(ada)] == [kept]
    assert db.delete_document(ada, saved) is False


def test_a_user_cannot_reach_the_documents_of_another(ada, grace):
    saved = db.add_document(ada, "csa", "Acme", '{"a": 1}')

    assert db.list_documents(grace) == []
    assert db.get_document(grace, saved["id"]) is None
    assert db.update_document(grace, saved["id"], "psa", "Mine", "{}") is None
    assert db.delete_document(grace, saved["id"]) is False
    assert db.get_document(ada, saved["id"])["state"] == '{"a": 1}'


def test_sessions_and_documents_need_a_user(database):
    with sqlite3.connect(database) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO sessions VALUES ('token', 99, '9999')")

    with pytest.raises(sqlite3.IntegrityError):
        db.add_document(99, "csa", "", "{}")
