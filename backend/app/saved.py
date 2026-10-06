"""The documents a user has drafted, kept so they can come back to them.

The browser saves a document after each reply from the assistant: the agreement as it stands and
the conversation that produced it, which is what it needs to carry on later.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field, model_validator

from app import auth, chat, db, documents

# A request to the assistant carries at most 40 messages; the whole conversation is kept.
MAX_MESSAGES = 200
NOT_FOUND = "This document doesn’t exist or has been deleted."
# Within what the database can hold as an id.
DocumentId = Annotated[int, Path(ge=1, le=2**63 - 1)]


class Draft(BaseModel):
    """The agreement being drafted. Mirrors the frontend's Draft."""

    document: str
    # The Mutual NDA's form. The other documents keep their fields in `values`.
    form: chat.Form
    values: dict[str, chat.Text]
    settled: list[chat.Default]

    @model_validator(mode="after")
    def is_a_document_with_its_own_fields(self) -> "Draft":
        doc = documents.load().get(self.document)
        if doc is None:
            raise ValueError("Not a document that can be drafted")
        if unknown := set(self.values) - set(doc.keys):
            raise ValueError(f"Not fields of the document: {sorted(unknown)}")
        return self


class State(BaseModel):
    draft: Draft
    # The conversation about this document, which ends with the reply that was just given.
    messages: list[chat.Message] = Field(min_length=1, max_length=MAX_MESSAGES)

    @model_validator(mode="after")
    def ends_with_the_assistant(self) -> "State":
        if self.messages[-1].role != "assistant":
            raise ValueError("The last message must be from the assistant")
        return self


class Summary(BaseModel):
    id: int
    document: str
    # The companies the agreement is between, e.g. "Acme Inc. and Globex LLC".
    parties: str
    updatedAt: str


class Saved(Summary, State):
    pass


def _parties(draft: Draft) -> str:
    if draft.document == documents.NDA:
        companies = [draft.form.party1.company, draft.form.party2.company]
    else:
        doc = documents.load()[draft.document]
        companies = [draft.values.get(f"{party.key}Company", "") for party in doc.parties]
    return " and ".join(filter(None, (company.strip() for company in companies)))


def _summary(row: dict) -> Summary:
    return Summary(
        id=row["id"], document=row["document"], parties=row["parties"], updatedAt=row["updated_at"]
    )


def _columns(state: State) -> tuple[str, str, str]:
    """What is stored for a document: which one it is, its parties, and all of it as JSON."""
    return state.draft.document, _parties(state.draft), state.model_dump_json()


router = APIRouter(prefix="/api/documents")


@router.get("")
def list_documents(user: auth.CurrentUser) -> list[Summary]:
    return [_summary(row) for row in db.list_documents(user.id)]


@router.post("", status_code=201)
def create_document(state: State, user: auth.CurrentUser) -> Summary:
    return _summary(db.add_document(user.id, *_columns(state)))


@router.get("/{document_id}")
def get_document(document_id: DocumentId, user: auth.CurrentUser) -> Saved:
    row = db.get_document(user.id, document_id)
    if row is None:
        raise HTTPException(404, NOT_FOUND)
    state = State.model_validate_json(row["state"])
    return Saved(**_summary(row).model_dump(), draft=state.draft, messages=state.messages)


@router.put("/{document_id}")
def update_document(document_id: DocumentId, state: State, user: auth.CurrentUser) -> Summary:
    row = db.update_document(user.id, document_id, *_columns(state))
    if row is None:
        raise HTTPException(404, NOT_FOUND)
    return _summary(row)


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: DocumentId, user: auth.CurrentUser) -> None:
    if not db.delete_document(user.id, document_id):
        raise HTTPException(404, NOT_FOUND)
