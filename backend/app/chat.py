import json
import logging
import os
import re
from datetime import date, timedelta
from typing import Annotated, Literal, get_args

from litellm import completion
from pydantic import BaseModel, Field, field_validator, model_validator

from app import documents

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
# Without allow_fallbacks, OpenRouter quietly uses another provider when Cerebras turns the request
# down, and the ones it picks are slow and return corrupted fields. Failing is better than that.
EXTRA_BODY = {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
TIMEOUT_SECONDS = 30
# An answer is a few hundred tokens. Unset, Cerebras reserves its whole 40,000 token limit, which
# an account that is low on credit cannot cover.
MAX_TOKENS = 2000

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
PARTIES = ("party1", "party2")
DEFAULT_PURPOSE = "Evaluating whether to enter into a business relationship with the other party."
COMPLETE = (
    "That’s everything the agreement needs. Review the document, and download the PDF when "
    "you’re ready."
)

SYSTEM_PROMPT = """\
You are a friendly assistant helping someone draft a Mutual Non-Disclosure Agreement (the Common \
Paper Mutual NDA). The agreement is shown beside this chat and updates as you fill in its fields.

The fields are:
- purpose: how the confidential information may be used. Standard default: "Evaluating whether \
to enter into a business relationship with the other party."
- effectiveDate: the date the agreement starts, as yyyy-mm-dd. Default: today.
- mndaTerm: "expires" (the NDA ends a number of years after the effective date) or \
"until-terminated" (it continues until either party ends it). Default: "expires".
- mndaTermYears: the number of years when mndaTerm is "expires". Default: 1.
- confidentialityTerm: "years" (confidential information stays protected for a number of years) \
or "perpetuity" (forever). Default: "years".
- confidentialityYears: the number of years when confidentialityTerm is "years". Default: 1.
- governingLaw: the state whose laws apply, for example "Delaware".
- jurisdiction: the city or county and state whose courts hear disputes, for example \
"New Castle, DE".
- modifications: any changes to the standard terms. Empty means none.
- For each of the two parties (party1 and party2): Company, Name (the person signing), Title \
(that person's job title) and NoticeAddress (an email or postal address for legal notices).

How to fill in the fields:
- Set a field only when the user's latest message gives or changes its value. Use null for every \
other field. Never send back a value that is already filled in unless the user changes it.
- Never invent or guess a value. If the user has not said it, leave it null.
- If the user gives several values at once, record all of them.
- The jurisdiction needs a state. If the user names only a city or county, leave it null and ask \
which state.
- To remove the modifications, set them to an empty string.
- Write dates in fields as yyyy-mm-dd, working out relative dates such as "next Monday" from \
the calendar you are given.
- The five "keeps" fields say whether the user's latest message agrees to keep a default: \
keepsPurpose, keepsEffectiveDate, keepsMndaTerm, keepsConfidentialityTerm and \
keepsNoModifications (the user wants no modifications). An answer such as "keep it" or \
"that's fine" applies only to what you asked about last. They are false otherwise.

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
# Shared with the chat for the other documents, which lists the documents after it.
OTHER_DOCUMENTS = """
Other documents:
- "document" is null unless the user's latest message clearly asks to draft a different document \
from the list below. Then set it to that document's id and leave every other field null. Never \
set it because a document is only mentioned, or to the document already being drafted.
- Details of the agreement, such as its dates, length, fees or governing law, are answers about \
the document being drafted. They are never a request for a different one.
- If the user asks for a kind of document that is not in the list, say plainly that you cannot \
generate it, and name the closest document in the list and what it covers. Do not set "document" \
until the user says they want that one.
"""
SYSTEM_PROMPT += f"{OTHER_DOCUMENTS}\nThe documents you can draft:\n{documents.catalog()}\n"


class ChatUnavailable(Exception):
    """The chat can't run because no API key is configured."""


class ChatFailed(Exception):
    """The model could not be reached or did not give a usable answer."""


MAX_TEXT = 4000
Text = Annotated[str, Field(max_length=MAX_TEXT)]
# The topics that start with a default, which the user may simply agree to keep.
Default = Literal["purpose", "effectiveDate", "mndaTerm", "confidentialityTerm", "modifications"]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_TEXT)


# These models mirror the frontend's NdaForm, so they share its field names.
class Party(BaseModel):
    name: Text
    title: Text
    company: Text
    noticeAddress: Text


class Form(BaseModel):
    purpose: Text
    # None means "today".
    effectiveDate: Text | None
    mndaTerm: Literal["expires", "until-terminated"]
    mndaTermYears: Text
    confidentialityTerm: Literal["years", "perpetuity"]
    confidentialityYears: Text
    governingLaw: Text
    jurisdiction: Text
    modifications: Text
    party1: Party
    party2: Party


class Conversation(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=40)
    today: date
    # The user has only just chosen this document, in the latest message.
    fresh: bool = False

    @field_validator("today")
    @classmethod
    def is_a_plausible_date(cls, today: date) -> date:
        if not 2000 <= today.year <= 2100:
            raise ValueError("Today's date is out of range")
        return today

    @model_validator(mode="after")
    def ends_with_the_user(self) -> "Conversation":
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user")
        return self


class ChatRequest(Conversation):
    form: Form
    # The defaults the user has already agreed to keep. Nothing is stored between requests.
    settled: list[Default]


class ChatResponse(BaseModel):
    reply: str
    # The fields to update, shaped like a partial NdaForm.
    changes: dict
    settled: list[Default]
    # Set when the user asked for another document instead. Nothing else is filled in then.
    document: str | None = None


class NdaUpdate(BaseModel):
    """What the model returns. A null field is left as it is.

    Flat, with every field required, so that it is accepted as a strict Structured Outputs schema.
    """

    purpose: str | None
    effectiveDate: str | None
    mndaTerm: Literal["expires", "until-terminated"] | None
    mndaTermYears: int | None
    confidentialityTerm: Literal["years", "perpetuity"] | None
    confidentialityYears: int | None
    governingLaw: str | None
    jurisdiction: str | None
    modifications: str | None
    party1Company: str | None
    party1Name: str | None
    party1Title: str | None
    party1NoticeAddress: str | None
    party2Company: str | None
    party2Name: str | None
    party2Title: str | None
    party2NoticeAddress: str | None
    keepsPurpose: bool
    keepsEffectiveDate: bool
    keepsMndaTerm: bool
    keepsConfidentialityTerm: bool
    keepsNoModifications: bool
    reply: str
    # Asked for separately because the model otherwise tends to stop after acknowledging.
    nextQuestion: str | None
    document: Literal[*(id for id in documents.load() if id != documents.NDA)] | None


def clean_text(value: str | None) -> str | None:
    """Blank text is dropped: the model sometimes sends it for values it was not given.

    So is text too long for the form, which the next request would be rejected for.
    """
    text = (value or "").strip()
    return text if 0 < len(text) <= MAX_TEXT else None


def _modifications(value: str | None) -> str | None:
    """The one value that blank text removes, since "no modifications" is a real answer."""
    return "" if value is not None and not value.strip() else clean_text(value)


def clean_date(value: str | None) -> str | None:
    if value is None or not ISO_DATE.fullmatch(value):
        return None
    try:
        return value if date.fromisoformat(value).year >= 1000 else None
    except ValueError:
        return None


def _years(value: int | None) -> str | None:
    """The form keeps years as text."""
    return str(value) if value is not None and 1 <= value <= 99 else None


def _changed(proposed: dict, current: dict) -> dict:
    return {
        field: value
        for field, value in proposed.items()
        if value is not None and value != current[field]
    }


def changes(update: NdaUpdate, form: Form, today: date) -> dict:
    """The valid values in the model's update that differ from the form."""
    current = form.model_dump()
    current["effectiveDate"] = form.effectiveDate or today.isoformat()
    result = _changed(
        {
            "purpose": clean_text(update.purpose),
            "effectiveDate": clean_date(update.effectiveDate),
            "mndaTerm": update.mndaTerm,
            "mndaTermYears": _years(update.mndaTermYears),
            "confidentialityTerm": update.confidentialityTerm,
            "confidentialityYears": _years(update.confidentialityYears),
            "governingLaw": clean_text(update.governingLaw),
            "jurisdiction": clean_text(update.jurisdiction),
            "modifications": _modifications(update.modifications),
        },
        current,
    )
    for party in PARTIES:
        proposed = {
            field: clean_text(getattr(update, f"{party}{field[0].upper()}{field[1:]}"))
            for field in Party.model_fields
        }
        if changed := _changed(proposed, current[party]):
            result[party] = changed
    return result


def _apply(form: Form, changes: dict) -> Form:
    values = form.model_dump()
    for field, value in changes.items():
        values[field] = {**values[field], **value} if field in PARTIES else value
    return Form.model_validate(values)


def _answered(update: NdaUpdate, asked: str | None) -> set[str]:
    """The defaults the model's update settles, by giving a value or by keeping what was asked."""
    answers = {
        "purpose": (update.keepsPurpose, update.purpose),
        "effectiveDate": (update.keepsEffectiveDate, update.effectiveDate),
        "mndaTerm": (update.keepsMndaTerm, update.mndaTerm or update.mndaTermYears),
        "confidentialityTerm": (
            update.keepsConfidentialityTerm,
            update.confidentialityTerm or update.confidentialityYears,
        ),
        # Blank modifications are not a value, so declining them only counts when asked.
        "modifications": (update.keepsNoModifications, clean_text(update.modifications)),
    }
    # The model sometimes reports an agreement the user did not give, so one is only believed
    # for the question that was just put to the user.
    return {
        topic
        for topic, (kept, value) in answers.items()
        if value is not None or (kept and topic == asked)
    }


def _party_question(number: int, party: Party) -> str | None:
    details = {part: getattr(party, part[0].lower() + part[1:]) for part in documents.PARTY_LABELS}
    return documents.party_question(f"Party {number}", details)


def open_questions(form: Form, settled: set[str]) -> dict[str, str]:
    """What is left to ask the user, by topic, in the order to ask it.

    Worked out here, not by the model, which loses track of what has been settled and would
    otherwise skip the defaults or finish early.
    """
    questions = {
        "party1": _party_question(1, form.party1),
        "party2": _party_question(2, form.party2),
    }
    if form.purpose == DEFAULT_PURPOSE:
        questions["purpose"] = (
            f"The standard purpose is “{DEFAULT_PURPOSE}” Shall we keep that, or change it?"
        )
    if form.effectiveDate is None:
        questions["effectiveDate"] = (
            "The agreement is set to start today. Keep that, or choose another effective date?"
        )
    if (form.mndaTerm, form.mndaTermYears) == ("expires", "1"):
        questions["mndaTerm"] = (
            "By default the NDA expires 1 year after the effective date. Keep that, change the "
            "number of years, or have it continue until either party ends it?"
        )
    if (form.confidentialityTerm, form.confidentialityYears) == ("years", "1"):
        questions["confidentialityTerm"] = (
            "By default confidential information stays protected for 1 year. Keep that, change "
            "the number of years, or protect it forever?"
        )
    if not form.governingLaw.strip():
        questions["governingLaw"] = "Which state’s laws should govern the agreement?"
    if not form.jurisdiction.strip():
        questions["jurisdiction"] = (
            "Where should disputes be heard? Give a city or county and its state, such as "
            "New Castle, DE."
        )
    if not form.modifications.strip():
        questions["modifications"] = (
            "Would you like any modifications to the standard terms, or none?"
        )
    return {
        topic: question
        for topic, question in questions.items()
        if question and topic not in settled
    }


def calendar(today: date) -> str:
    # Spelled out because the model is unreliable at working out weekdays for itself.
    days = ", ".join(
        f"{day:%A} {day.isoformat()}" for day in (today + timedelta(days=n) for n in range(15))
    )
    return f"Today is {today:%A}, {today.isoformat()}.\nToday and the next two weeks: {days}.\n"


FRESH = (
    "The user has just chosen this document in their latest message. Say in your reply that "
    'you are starting it, and leave "document" null.\n'
)


def numbered(questions: dict[str, str]) -> str:
    return "\n".join(
        f"{number}. {question}" for number, question in enumerate(questions.values(), start=1)
    )


def context(request: Conversation, values: dict, questions: dict[str, str]) -> str:
    """What the model needs to know besides the conversation: the date, the agreement as it
    stands and what is left to ask."""
    return (
        f"{FRESH if request.fresh else ''}"
        f"{calendar(request.today)}"
        f"Current field values:\n{json.dumps(values, indent=2)}\n"
        "Questions still open before the user's latest message:\n"
        f"{numbered(questions) or 'None.'}"
    )


def _context(request: ChatRequest) -> str:
    values = request.form.model_dump()
    values["effectiveDate"] = request.form.effectiveDate or request.today.isoformat()
    return context(request, values, open_questions(request.form, set(request.settled)))


def ask(messages: list[dict], schema: type[BaseModel]) -> BaseModel:
    """Gets the model's answer to the conversation, in the shape of the schema."""
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise ChatUnavailable
    try:
        response = completion(
            model=MODEL,
            messages=messages,
            response_format=schema,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            timeout=TIMEOUT_SECONDS,
            max_tokens=MAX_TOKENS,
        )
        return schema.model_validate_json(response.choices[0].message.content)
    except Exception as error:
        logger.exception("The chat model call failed")
        raise ChatFailed from error


def is_question(text: str) -> bool:
    return "?" in text


def close_reply(reply: str, suggested: str | None, question: str | None, done: str = "") -> str:
    """Ends the model's reply with a question for as long as something is left to ask.

    `question` is the next thing to ask, or None when nothing is left. The model's own wording
    is used when it is a question, so that it follows on from the conversation. The model often
    stops at an acknowledgement or a statement instead, and then `question` is asked as it is.
    """
    reply = reply.strip()
    # The model sometimes leaves its last sentence unfinished, which runs into what follows.
    if reply and reply[-1].isalnum():
        reply += "."
    if question:
        suggested = (suggested or "").strip()
        closing = suggested if is_question(suggested) else question
    else:
        closing = done
    # The model sometimes puts its question in the reply as well.
    if closing in reply:
        closing = ""
    if not reply and not closing:
        raise ChatFailed
    # Cut to what the next request may send back as part of the conversation, keeping the question.
    room = MAX_TEXT - len(closing) - 1 if closing else MAX_TEXT
    return f"{reply[:room]} {closing}".strip()


def is_switch(document: str | None, fresh: bool, changed: dict) -> bool:
    """Whether the user asked for the other document that the model named.

    Not straight after choosing this one: the message that chose it would choose again. And not
    when the message filled in fields of this one: the model often names another document while
    recording an answer, which is no request to abandon the agreement.
    """
    return bool(document) and not fresh and not changed


def respond(request: ChatRequest) -> ChatResponse:
    """Asks the model for the next message and the fields the user has just given."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _context(request)},
        *(message.model_dump() for message in request.messages),
    ]
    update = ask(messages, NdaUpdate)
    changed = changes(update, request.form, request.today)
    if is_switch(update.document, request.fresh, changed):
        return ChatResponse(reply="", changes={}, settled=request.settled, document=update.document)

    was_open = open_questions(request.form, set(request.settled))
    settled = set(request.settled) | _answered(update, asked=next(iter(was_open), None))
    still_open = open_questions(_apply(request.form, changed), settled)

    return ChatResponse(
        reply=close_reply(
            update.reply,
            update.nextQuestion,
            next(iter(still_open.values()), None),
            done=COMPLETE if was_open else "",
        ),
        changes=changed,
        settled=[topic for topic in get_args(Default) if topic in settled],
    )
