import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import PAGES


def test_serves_the_home_page(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "Home" in response.text


@pytest.mark.parametrize(("page", "heading"), PAGES.items())
def test_serves_each_page_with_or_without_a_trailing_slash(anonymous, page, heading):
    # To anyone: a page is only the screen, and what it shows comes from the API.
    assert heading in anonymous.get(f"/{page}/").text
    assert heading in anonymous.get(f"/{page}").text


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
