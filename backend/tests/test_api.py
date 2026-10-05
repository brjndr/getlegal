import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_health(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_saves_the_user(client, database):
    response = client.post("/api/login", json={"email": "ada@example.com", "password": "secret"})

    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": "ada@example.com"}
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT email, password_hash FROM users").fetchall() == [
            ("ada@example.com", None)
        ]


def test_login_returns_the_same_user_whatever_the_password(client):
    first = client.post("/api/login", json={"email": "ada@example.com", "password": "one"})
    second = client.post("/api/login", json={"email": "ada@example.com", "password": "two"})
    without = client.post("/api/login", json={"email": "ada@example.com"})

    assert first.json() == second.json() == without.json()


def test_login_treats_differently_typed_emails_as_one_user(client):
    first = client.post("/api/login", json={"email": "ada@example.com"})
    second = client.post("/api/login", json={"email": "  Ada@Example.COM "})

    assert second.json() == first.json()


def test_login_gives_each_email_its_own_user(client):
    ada = client.post("/api/login", json={"email": "ada@example.com"}).json()
    grace = client.post("/api/login", json={"email": "grace@example.com"}).json()

    assert ada["id"] != grace["id"]


@pytest.mark.parametrize(
    "email", ["", "   ", "ada", "ada@", "@example.com", "ada@example", "a b@c.d"]
)
def test_login_rejects_an_invalid_email(client, email):
    response = client.post("/api/login", json={"email": email})

    assert response.status_code == 422


def test_login_requires_an_email(client):
    assert client.post("/api/login", json={"password": "secret"}).status_code == 422


def test_each_start_begins_with_an_empty_database(static_dir):
    with TestClient(create_app(static_dir)) as client:
        client.post("/api/login", json={"email": "ada@example.com"})
        client.post("/api/login", json={"email": "grace@example.com"})

    with TestClient(create_app(static_dir)) as client:
        response = client.post("/api/login", json={"email": "grace@example.com"})

    assert response.json()["id"] == 1


def test_cors_is_off_unless_configured(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})

    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_the_configured_origins(static_dir, monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")

    with TestClient(create_app(static_dir)) as client:
        allowed = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
        other = client.get("/api/health", headers={"Origin": "http://evil.example"})

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in other.headers
