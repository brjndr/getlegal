import copy

import pytest

from app import db
from tests.test_chat import ADA, FORM, HANK
from tests.test_converse import ACME, GLOBEX

MESSAGES = [
    {"role": "user", "content": "A pilot between Acme and Globex"},
    {"role": "assistant", "content": "Who signs for Acme?"},
]


def state(document="pilot-agreement", values=None, form=None, messages=MESSAGES, **draft):
    return {
        "draft": {
            "document": document,
            "form": {**copy.deepcopy(FORM), **(form or {})},
            "values": values or {},
            "settled": [],
            **draft,
        },
        "messages": messages,
    }


def test_a_saved_document_can_be_opened_again(client, monkeypatch):
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T10:00:00+00:00")
    saved = state(values={**ACME, **GLOBEX})

    response = client.post("/api/documents", json=saved)

    summary = {
        "id": 1,
        "document": "pilot-agreement",
        "parties": "Acme Inc. and Globex LLC",
        "updatedAt": "2026-10-06T10:00:00+00:00",
    }
    assert response.status_code == 201
    assert response.json() == summary
    assert client.get("/api/documents").json() == [summary]
    assert client.get("/api/documents/1").json() == {**summary, **saved}


def test_a_mutual_nda_keeps_its_form_and_what_was_settled(client):
    saved = state("mutual-nda", form={"party1": ADA, "party2": HANK}, settled=["purpose"])

    summary = client.post("/api/documents", json=saved).json()

    opened = client.get(f"/api/documents/{summary['id']}").json()
    assert summary["parties"] == "Acme Inc. and Globex LLC"
    assert opened["draft"] == saved["draft"]
    # Still "today", whenever it is opened.
    assert opened["draft"]["form"]["effectiveDate"] is None


@pytest.mark.parametrize(
    ("values", "parties"),
    [({}, ""), (ACME, "Acme Inc."), ({"customerCompany": "  Globex LLC "}, "Globex LLC")],
)
def test_the_parties_are_the_companies_named_so_far(client, values, parties):
    assert client.post("/api/documents", json=state(values=values)).json()["parties"] == parties


def test_saving_again_replaces_the_document(client, monkeypatch):
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T10:00:00+00:00")
    client.post("/api/documents", json=state())
    monkeypatch.setattr(db, "now", lambda: "2026-10-06T11:00:00+00:00")
    later = state(values=ACME, messages=[*MESSAGES, *MESSAGES])

    response = client.put("/api/documents/1", json=later)

    summary = {
        "id": 1,
        "document": "pilot-agreement",
        "parties": "Acme Inc.",
        "updatedAt": "2026-10-06T11:00:00+00:00",
    }
    assert response.status_code == 200
    assert response.json() == summary
    assert client.get("/api/documents").json() == [summary]
    assert client.get("/api/documents/1").json() == {**summary, **later}


def test_a_deleted_document_is_gone(client):
    client.post("/api/documents", json=state())
    client.post("/api/documents", json=state("csa"))

    response = client.delete("/api/documents/1")

    assert response.status_code == 204
    assert [saved["id"] for saved in client.get("/api/documents").json()] == [2]
    assert client.get("/api/documents/1").status_code == 404


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_a_document_that_does_not_exist_is_not_found(client, method):
    response = client.request(method, "/api/documents/1", json=state())

    assert response.status_code == 404
    assert response.json() == {"detail": "This document doesn’t exist or has been deleted."}


@pytest.mark.parametrize("document_id", ["0", "-1", "abc", "1.5", str(2**63), "9" * 30])
@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_an_id_that_no_document_could_have_is_refused(client, method, document_id):
    response = client.request(method, f"/api/documents/{document_id}", json=state())

    assert response.status_code == 422


def test_a_user_sees_only_their_own_documents(client, sign_up):
    grace = sign_up("grace@example.com")
    saved = state(values=ACME)
    client.post("/api/documents", json=saved)

    assert grace.get("/api/documents").json() == []
    assert grace.get("/api/documents/1").status_code == 404
    assert grace.put("/api/documents/1", json=state("csa")).status_code == 404
    assert grace.delete("/api/documents/1").status_code == 404
    assert client.get("/api/documents/1").json()["draft"] == saved["draft"]


@pytest.mark.parametrize(
    "invalid",
    [
        state("will"),
        state(values={"purpose": "Not a field of the Pilot Agreement"}),
        state(values={"product": "x" * 4001}),
        state(settled=["governingLaw"]),
        state(messages=[]),
        state(messages=MESSAGES[:1]),
        state(messages=MESSAGES * 101),
        state(messages=[{"role": "assistant", "content": ""}]),
    ],
    ids=[
        "unknown document",
        "another document's field",
        "value too long",
        "not a default",
        "no messages",
        "ends with the user",
        "too many messages",
        "empty message",
    ],
)
def test_a_document_that_could_not_be_carried_on_with_is_not_saved(client, invalid):
    assert client.post("/api/documents", json=invalid).status_code == 422
    assert client.get("/api/documents").json() == []


def test_the_whole_conversation_is_kept(client):
    long = state(messages=MESSAGES * 100)

    client.post("/api/documents", json=long)

    assert len(client.get("/api/documents/1").json()["messages"]) == 200
