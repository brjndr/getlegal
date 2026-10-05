import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def static_dir(tmp_path):
    """Stands in for the frontend's static export."""
    root = tmp_path / "static"
    (root / "login").mkdir(parents=True)
    (root / "index.html").write_text("<h1>Home</h1>")
    (root / "login" / "index.html").write_text("<h1>Sign in</h1>")
    (root / "404.html").write_text("<h1>Not found</h1>")
    return root


@pytest.fixture
def client(static_dir):
    # Entering the client runs the app's startup, which creates the database.
    with TestClient(create_app(static_dir)) as client:
        yield client
