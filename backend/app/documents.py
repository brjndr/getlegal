"""The documents the product can draft, read from the specs shared with the frontend."""

import json
import os
from datetime import date
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

NDA = "mutual-nda"
# The value recorded for an optional term the user does not want.
SKIPPED = "None"
# The topic that covers every optional term at once.
OPTIONAL = "optional"
PARTY_LABELS = {
    "Company": "company",
    "Name": "signer’s name",
    "Title": "signer’s title",
    "NoticeAddress": "notice address",
}


class Party(BaseModel):
    key: str
    label: str

    @property
    def fields(self) -> list[str]:
        return [f"{self.key}{part}" for part in PARTY_LABELS]


class Field(BaseModel):
    key: str
    label: str
    kind: Literal["text", "date"] = "text"
    # An optional term is offered once, with the others, and can be left out.
    optional: bool = False
    # "today": the user is asked whether to keep it.
    default: Literal["today"] | None = None
    ask: str = ""
    hint: str


class Document(BaseModel):
    id: str
    name: str
    template: str
    summary: str
    # "nda" is drafted by the Mutual NDA's own chat, in chat.py.
    engine: Literal["nda"] | None = None
    parties: list[Party] = []
    fields: list[Field] = []

    @property
    def keys(self) -> list[str]:
        return [key for party in self.parties for key in party.fields] + [
            field.key for field in self.fields
        ]

    @property
    def optional(self) -> list[Field]:
        return [field for field in self.fields if field.optional]


def _specs_path() -> Path:
    default = Path(__file__).resolve().parents[2] / "documents" / "specs.json"
    return Path(os.environ.get("SPECS_PATH", default))


@cache
def load() -> dict[str, Document]:
    specs = json.loads(_specs_path().read_text(encoding="utf-8"))
    return {spec["id"]: Document.model_validate(spec) for spec in specs["documents"]}


def catalog() -> str:
    """The documents on offer, for the model to choose from."""
    return "\n".join(f"- {doc.id}: {doc.name}. {doc.summary}" for doc in load().values())


def names() -> str:
    return ", ".join(doc.name for doc in load().values())


def _listed(items: list[str]) -> str:
    return " and ".join(filter(None, [", ".join(items[:-1]), items[-1]]))


def party_question(label: str, values: dict[str, str]) -> str | None:
    """Asks for whatever is missing of a party's company, signer and notice address.

    `values` holds the party's four details by the names in PARTY_LABELS.
    """
    missing = [text for part, text in PARTY_LABELS.items() if not values[part].strip()]
    if not missing:
        return None
    verb = "is" if len(missing) == 1 else "are"
    return f"What {verb} the {_listed(missing)} for {values['Company'].strip() or label}?"


def open_questions(doc: Document, values: dict[str, str]) -> dict[str, str]:
    """What is left to ask the user, by topic, in the order to ask it.

    A topic is a party, a field, or all the optional terms together. It is open while it has a
    blank value, so keeping a default or declining the optional terms writes a value.
    """
    questions = {}
    for party in doc.parties:
        details = {part: values.get(f"{party.key}{part}", "") for part in PARTY_LABELS}
        if question := party_question(f"the {party.label}", details):
            questions[party.key] = question
    for field in doc.fields:
        if not field.optional and not values.get(field.key, "").strip():
            questions[field.key] = field.ask
    if blank := [field.label for field in doc.optional if not values.get(field.key, "").strip()]:
        questions[OPTIONAL] = (
            f"You can also set these optional terms: {_listed(blank)}. Would you like to add "
            "any of them, or leave them out?"
        )
    return questions


def accepted(doc: Document, topic: str, values: dict[str, str], today: date) -> dict[str, str]:
    """The values to record when the user accepts what a question offers.

    That is the default of a field that has one, and no optional terms beyond those already set.
    """
    if topic == OPTIONAL:
        return {
            field.key: SKIPPED for field in doc.optional if not values.get(field.key, "").strip()
        }
    return {
        field.key: today.isoformat() for field in doc.fields if field.key == topic and field.default
    }
