import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import chat
from app.main import create_app


class FakeModel:
    """Stands in for the language model, recording what it is asked."""

    def __init__(self):
        self.calls = []
        self.answer = AssertionError("The test did not say how the model answers")

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.answer, Exception):
            raise self.answer
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.answer))]
        )

    def says(self, reply="OK", **fields):
        """Answers with this reply, changing only the given fields."""
        unchanged = {
            name: False if name.startswith("keeps") else None
            for name in chat.NdaUpdate.model_fields
        }
        self.answer = json.dumps({**unchanged, "reply": reply, **fields})


@pytest.fixture(autouse=True)
def model(monkeypatch):
    # Replaced in every test, so none of them can reach the real model.
    model = FakeModel()
    monkeypatch.setattr(chat, "completion", model)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    return model


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
