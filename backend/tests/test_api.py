import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.main import create_app
from tests.conftest import PASSWORD

ADA = {"email": "ada@example.com", "password": PASSWORD}


def test_health(anonymous):
    response = anonymous.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_signing_up_creates_the_account_and_signs_in(anonymous, database):
    response = anonymous.post("/api/signup", json=ADA)

    assert response.status_code == 201
    assert response.json() == {"id": 1, "email": "ada@example.com"}
    assert anonymous.get("/api/me").json() == {"id": 1, "email": "ada@example.com"}
    with sqlite3.connect(database) as conn:
        [(email, password_hash)] = conn.execute("SELECT email, password_hash FROM users")
    assert email == "ada@example.com"
    assert password_hash.startswith("scrypt$")
    assert PASSWORD not in password_hash


def test_the_session_cookie_is_out_of_reach_of_scripts_and_other_sites(anonymous, database):
    response = anonymous.post("/api/signup", json=ADA)

    cookie = response.headers["set-cookie"]
    token = response.cookies[auth.COOKIE]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=2592000" in cookie
    assert "Secure" not in cookie
    with sqlite3.connect(database) as conn:
        [(stored,)] = conn.execute("SELECT token_hash FROM sessions")
    # Only a hash of the token is kept.
    assert len(token) >= 43
    assert stored != token


def test_the_session_cookie_is_for_https_only_when_configured(anonymous, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "1")

    response = anonymous.post("/api/signup", json=ADA)

    assert "Secure" in response.headers["set-cookie"]


def test_signing_up_treats_differently_typed_emails_as_one_account(anonymous):
    anonymous.post("/api/signup", json=ADA)

    response = anonymous.post("/api/signup", json={**ADA, "email": "  Ada@Example.COM "})

    assert response.status_code == 409
    assert response.json() == {
        "detail": "An account with this email already exists. Sign in instead."
    }


def test_signing_up_again_does_not_change_the_password(anonymous):
    anonymous.post("/api/signup", json=ADA)

    anonymous.post("/api/signup", json={**ADA, "password": "another one"})

    assert anonymous.post("/api/login", json=ADA).status_code == 200


@pytest.mark.parametrize(
    "email",
    ["", "   ", "ada", "ada@", "@example.com", "ada@example", "a b@c.d", "a" * 250 + "@b.co"],
)
def test_signing_up_rejects_an_invalid_email(anonymous, email):
    response = anonymous.post("/api/signup", json={**ADA, "email": email})

    assert response.status_code == 422


@pytest.mark.parametrize("password", ["", "seven77", "x" * 129])
def test_signing_up_rejects_a_password_of_the_wrong_length(anonymous, password):
    response = anonymous.post("/api/signup", json={**ADA, "password": password})

    assert response.status_code == 422
    assert db.find_user("ada@example.com") is None


@pytest.mark.parametrize("credentials", [{"email": "ada@example.com"}, {"password": PASSWORD}])
def test_signing_up_requires_an_email_and_a_password(anonymous, credentials):
    assert anonymous.post("/api/signup", json=credentials).status_code == 422


def test_signing_in_with_the_right_password(sign_up, anonymous):
    sign_up("ada@example.com")

    response = anonymous.post("/api/login", json={**ADA, "email": " ADA@example.com"})

    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": "ada@example.com"}
    assert anonymous.get("/api/me").json() == {"id": 1, "email": "ada@example.com"}


@pytest.mark.parametrize(
    "credentials",
    [
        {**ADA, "password": "wrong horse"},
        {**ADA, "password": ""},
        {"email": "grace@example.com", "password": PASSWORD},
    ],
    ids=["wrong password", "no password", "unknown email"],
)
def test_signing_in_fails_the_same_way_whatever_was_wrong(sign_up, anonymous, credentials):
    sign_up("ada@example.com")

    response = anonymous.post("/api/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password."}
    assert "set-cookie" not in response.headers
    assert anonymous.get("/api/me").status_code == 401


def test_signing_in_checks_a_password_even_when_the_email_is_unknown(anonymous, monkeypatch):
    checked = []
    verify = auth.verify_password
    monkeypatch.setattr(
        auth, "verify_password", lambda *args: checked.append(args) or verify(*args)
    )

    anonymous.post("/api/login", json=ADA)

    assert checked == [(PASSWORD, auth.NOBODY)]


def test_each_user_has_their_own_account(sign_up):
    ada = sign_up("ada@example.com")
    grace = sign_up("grace@example.com")

    assert ada.get("/api/me").json() == {"id": 1, "email": "ada@example.com"}
    assert grace.get("/api/me").json() == {"id": 2, "email": "grace@example.com"}


def test_signing_out_ends_the_session(client):
    token = client.cookies[auth.COOKIE]

    response = client.post("/api/logout")

    assert response.status_code == 204
    assert auth.COOKIE not in client.cookies
    # The token is no good any more, even to someone who kept it.
    client.cookies.set(auth.COOKIE, token)
    assert client.get("/api/me").status_code == 401


def test_signing_out_leaves_other_sessions_alone(client, anonymous):
    anonymous.post("/api/login", json=ADA)

    client.post("/api/logout")

    assert anonymous.get("/api/me").status_code == 200


def test_signing_out_when_not_signed_in_is_fine(anonymous):
    assert anonymous.post("/api/logout").status_code == 204


def test_a_session_ends_after_thirty_days(client, monkeypatch):
    signed_up = db.now()[:10]
    monkeypatch.setattr(db, "now", lambda: f"{signed_up}T00:00:00+00:00")
    assert client.get("/api/me").status_code == 200

    monkeypatch.setattr(db, "now", lambda: "9999-01-01T00:00:00+00:00")
    assert client.get("/api/me").status_code == 401


def test_a_made_up_session_is_not_signed_in(anonymous):
    anonymous.cookies.set(auth.COOKIE, "made-up")

    response = anonymous.get("/api/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Sign in to continue."}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/me"),
        ("POST", "/api/chat"),
        ("POST", "/api/draft"),
        ("GET", "/api/documents"),
        ("POST", "/api/documents"),
        ("GET", "/api/documents/1"),
        ("PUT", "/api/documents/1"),
        ("DELETE", "/api/documents/1"),
    ],
)
def test_everything_else_is_for_signed_in_users_only(anonymous, model, method, path):
    # Refused before the request is looked at: not even its mistakes are reported.
    response = anonymous.request(method, path, json={})

    assert response.status_code == 401
    assert response.json() == {"detail": "Sign in to continue."}
    assert model.calls == []


def test_each_start_begins_with_an_empty_database(static_dir):
    with TestClient(create_app(static_dir)) as client:
        client.post("/api/signup", json=ADA)
        assert client.get("/api/me").status_code == 200

    with TestClient(create_app(static_dir)) as restarted:
        # The browser still has the cookie from before the restart.
        restarted.cookies.set(auth.COOKIE, client.cookies[auth.COOKIE])

        assert restarted.get("/api/me").status_code == 401
        assert restarted.post("/api/login", json=ADA).status_code == 401
        assert restarted.post("/api/signup", json=ADA).json()["id"] == 1


def test_a_password_is_hashed_differently_each_time():
    first = auth.hash_password(PASSWORD)
    second = auth.hash_password(PASSWORD)

    assert first != second
    assert auth.verify_password(PASSWORD, first)
    assert auth.verify_password(PASSWORD, second)
    assert not auth.verify_password("wrong horse", first)


def test_cors_is_off_unless_configured(anonymous):
    response = anonymous.get("/api/health", headers={"Origin": "http://localhost:3000"})

    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_the_configured_origins_to_send_the_session(static_dir, monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")

    with TestClient(create_app(static_dir)) as client:
        allowed = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
        other = client.get("/api/health", headers={"Origin": "http://evil.example"})

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in other.headers
