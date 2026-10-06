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
        answer = self.answer(kwargs["response_format"]) if callable(self.answer) else self.answer
        if isinstance(answer, Exception):
            raise answer
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=answer))])

    def says(self, reply="OK", **fields):
        """Answers with this reply, changing only the given fields."""

        def answer(schema):
            # Worked out from the schema of the request, which differs from document to document.
            unchanged = {
                name: False if field.annotation is bool else None
                for name, field in schema.model_fields.items()
            }
            return json.dumps({**unchanged, "reply": reply, **fields})

        self.answer = answer


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
