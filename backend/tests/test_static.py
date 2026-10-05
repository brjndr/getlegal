from fastapi.testclient import TestClient

from app.main import create_app


def test_serves_the_home_page(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "Home" in response.text


def test_serves_the_login_page_with_or_without_a_trailing_slash(client):
    assert "Sign in" in client.get("/login/").text
    assert "Sign in" in client.get("/login").text


def test_unknown_pages_get_the_not_found_page(client):
    response = client.get("/nope")

    assert response.status_code == 404
    assert "Not found" in response.text


def test_the_api_takes_precedence_over_the_frontend(client, static_dir):
    (static_dir / "api").mkdir()
    (static_dir / "api" / "health").write_text("not the API")

    assert client.get("/api/health").json() == {"status": "ok"}


def test_the_api_runs_without_a_built_frontend(tmp_path):
    with TestClient(create_app(tmp_path / "missing")) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404
