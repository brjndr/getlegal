"""The chat that helps the user choose a document, and drafts all of them but the Mutual NDA.

The Mutual NDA keeps its own chat, in chat.py. This one is driven by the specs in documents.py.
"""

from functools import cache
from typing import Literal

from pydantic import BaseModel, Field, create_model, model_validator

from app import chat, documents

CHOOSE = f"I can prepare these agreements: {documents.names()}. Which would you like to draft?"

CHOOSING_PROMPT = f"""\
You are a friendly assistant that helps people draft legal agreements from standard templates. \
The user has not chosen a document yet. Help them choose one from the list below.

- Set "document" to a document's id when the user's latest message names it, clearly describes \
what it is for, or accepts one you offered. Leave it null while it is unclear which they want.
- If the user asks for a kind of document that is not in the list, say plainly in "reply" that \
you cannot generate it, and name the closest document in the list and what it covers. Leave \
"document" null and use "nextQuestion" to ask whether they would like that one instead.
- "reply" briefly responds to the user. It never asks a question. Politely decline anything that \
is not about drafting an agreement.
- "nextQuestion" is one question that helps settle which document they need. It is null only \
when you set "document".
- Both are short plain text, without markdown or JSON.

The documents you can draft:
{documents.catalog()}
"""

DRAFTING_PROMPT = """\
You are a friendly assistant helping someone draft a {name} (the Common Paper standard \
{name}). The agreement is shown beside this chat and updates as you fill in its fields.

The fields are:
{fields}

How to fill in the fields:
- Set a field only when the user's latest message gives or changes its value. Use null for every \
other field. Never send back a value that is already filled in unless the user changes it.
- Never invent or guess a value. If the user has not said it, leave it null.
- If the user gives several values at once, record all of them.
- Write dates in fields as yyyy-mm-dd, working out relative dates such as "next Monday" from \
the calendar you are given.
- Write names, titles and addresses exactly as the user gave them. Write every other value as a \
short phrase in the user's own terms, not as a sentence.
- "acceptsAsked" is true only when the user's latest message agrees to what you asked last \
without giving a value: keeping a default ("keep it", "that's fine"), or wanting none, or no \
more, of the optional terms ("no", "none", "leave them out"). It is false otherwise.

What to say:
- "reply" briefly acknowledges what the user just told you, or answers their question about the \
agreement. It never asks a question. Do not say you changed something unless you set that field \
in this answer. Politely decline anything that is not about drafting an agreement.
- You are given the questions that are still open, in order. "nextQuestion" is the first of them \
that the user's latest message does not answer, in your own words. For a default, say what the \
default is and ask whether to keep it or change it. Ask one question at a time. It is null only \
when no question is left.
- Both are short plain text, without markdown or JSON. Write dates in words, such as \
"October 12, 2026".
"""

PARTY_HINTS = {
    "Company": "the company that is the {label}",
    "Name": "the name of the person signing for the {label}",
    "Title": "that person's job title",
    "NoticeAddress": "an email or postal address for legal notices to the {label}",
}


class DraftRequest(chat.Conversation):
    # None until the user has chosen what to draft.
    document: str | None
    # The document's fields by key. A blank or missing value has not been given yet.
    values: dict[str, chat.Text]

    @model_validator(mode="after")
    def has_only_its_own_fields(self) -> "DraftRequest":
        doc = documents.load().get(self.document)
        if self.document is not None and (doc is None or doc.engine):
            raise ValueError("This document is not drafted here")
        if unknown := set(self.values) - set(doc.keys if doc else []):
            raise ValueError(f"Not fields of the document: {sorted(unknown)}")
        return self


class DraftResponse(BaseModel):
    reply: str
    # The fields to update, by key.
    changes: dict[str, str]
    # Set when the user chose a document, or another one. Nothing else is filled in then.
    document: str | None = None


def _hints(doc: documents.Document) -> dict[str, str]:
    """What each field holds, for the model."""
    hints = {
        f"{party.key}{part}": hint.format(label=party.label)
        for party in doc.parties
        for part, hint in PARTY_HINTS.items()
    }
    for field in doc.fields:
        notes = [field.hint]
        if field.kind == "date":
            notes.append("as yyyy-mm-dd")
        if field.default:
            notes.append("default: today")
        if field.optional:
            notes.append("optional")
        hints[field.key] = f"{field.label}: {', '.join(notes)}"
    return hints


@cache
def schema(document: str | None) -> type[BaseModel]:
    """What the model returns while drafting this document, or choosing one when it is None.

    Flat, with every field required, so that it is accepted as a strict Structured Outputs schema.
    A null field is left as it is.
    """
    fields = {}
    if document:
        hints = _hints(documents.load()[document])
        fields = {key: (str | None, Field(description=hint)) for key, hint in hints.items()}
        fields["acceptsAsked"] = (bool, ...)
    others = [other for other in documents.load() if other != document]
    return create_model(
        "Update",
        **fields,
        document=(Literal[*others] | None, ...),
        reply=(str, ...),
        nextQuestion=(str | None, ...),
    )


@cache
def _instructions(document: str | None) -> str:
    if document is None:
        return CHOOSING_PROMPT
    doc = documents.load()[document]
    fields = "\n".join(f"- {key}: {hint}." for key, hint in _hints(doc).items())
    return (
        DRAFTING_PROMPT.format(name=doc.name, fields=fields)
        + chat.OTHER_DOCUMENTS
        + f"\nThe documents you can draft:\n{documents.catalog()}\n"
    )


def _changes(doc: documents.Document, update: BaseModel, values: dict[str, str]) -> dict[str, str]:
    """The valid values in the model's update that differ from the ones already held."""
    dates = {field.key for field in doc.fields if field.kind == "date"}
    proposed = {
        key: (chat.clean_date if key in dates else chat.clean_text)(getattr(update, key))
        for key in doc.keys
    }
    return {
        key: value
        for key, value in proposed.items()
        if value is not None and value != values.get(key, "")
    }


def respond(request: DraftRequest) -> DraftResponse:
    """Asks the model for the next message and the document or fields the user has just given."""
    doc = documents.load()[request.document] if request.document else None
    # Every field is listed, so the model sees which ones are still blank.
    values = {key: request.values.get(key, "") for key in doc.keys} if doc else {}
    was_open = documents.open_questions(doc, values) if doc else {}
    messages = [
        {"role": "system", "content": _instructions(request.document)},
        *([{"role": "system", "content": chat.context(request, values, was_open)}] if doc else []),
        *(message.model_dump() for message in request.messages),
    ]
    update = chat.ask(messages, schema(request.document))
    # Not straight after choosing this one: the message that chose it would choose again.
    if update.document and not request.fresh:
        return DraftResponse(reply="", changes={}, document=update.document)
    if doc is None:
        return DraftResponse(
            reply=chat.close_reply(update.reply, update.nextQuestion, CHOOSE), changes={}
        )

    changed = _changes(doc, update, values)
    # Only believed for the question that was just put to the user: the model sometimes reports
    # an agreement the user did not give.
    if update.acceptsAsked and was_open:
        asked = next(iter(was_open))
        kept = documents.accepted(doc, asked, {**values, **changed}, request.today)
        changed = {**kept, **changed}
    still_open = documents.open_questions(doc, {**values, **changed})

    return DraftResponse(
        reply=chat.close_reply(
            update.reply,
            update.nextQuestion,
            next(iter(still_open.values()), None),
            done=chat.COMPLETE if was_open else "",
        ),
        changes=changed,
    )
