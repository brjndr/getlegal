import pytest

from app import chat, converse, documents

GREETING = {"role": "assistant", "content": "What kind of agreement do you need?"}
ACME = {
    "providerCompany": "Acme Inc.",
    "providerName": "Ada Lovelace",
    "providerTitle": "CEO",
    "providerNoticeAddress": "legal@acme.example",
}
GLOBEX = {
    "customerCompany": "Globex LLC",
    "customerName": "Hank Scorpio",
    "customerTitle": "President",
    "customerNoticeAddress": "1 Globex Way, Cypress Creek, OR",
}
# A Pilot Agreement with nothing left to ask about.
FINISHED = {
    **ACME,
    **GLOBEX,
    "product": "Widget Cloud",
    "pilotPeriod": "90 days from the Effective Date",
    "effectiveDate": "2027-01-15",
    "generalCapAmount": "$10,000",
    "governingLaw": "laws of the State of Delaware",
    "chosenCourts": "state or federal courts located in New Castle County, Delaware",
}
PARTIES_QUESTION = (
    "What are the company, signer’s name, signer’s title and notice address for the Provider?"
)


def ask(client, text="A pilot", document="pilot-agreement", values=None, **overrides):
    body = {
        "messages": [GREETING, {"role": "user", "content": text}],
        "document": document,
        "values": values or {},
        "today": "2026-10-06",
        **overrides,
    }
    return client.post("/api/draft", json=body)


def choose(client, text="I need a contract", **overrides):
    return ask(client, text, document=None, **overrides)


def test_draft_asks_which_document_when_none_is_chosen(client, model):
    model.says("Happy to help.", nextQuestion="Is this for a trial of your product?")

    response = choose(client)

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Happy to help. Is this for a trial of your product?",
        "changes": {},
    }


@pytest.mark.parametrize("suggested", [None, "Tell me more.", " "])
def test_draft_lists_the_documents_when_the_model_asks_nothing(client, model, suggested):
    model.says("Happy to help.", nextQuestion=suggested)

    reply = choose(client).json()["reply"]

    assert reply.startswith("Happy to help. I can prepare these agreements: Mutual Non-Disclosure")
    assert reply.endswith("Software License Agreement. Which would you like to draft?")


def test_draft_hands_over_to_the_document_the_user_chooses(client, model):
    model.says("Let’s do it.", nextQuestion="Who is the provider?", document="pilot-agreement")

    # The frontend starts the document by sending the same message again, so nothing is said yet.
    assert choose(client, "A pilot agreement please").json() == {
        "reply": "",
        "changes": {},
        "document": "pilot-agreement",
    }


def test_draft_can_hand_over_to_the_mutual_nda(client, model):
    model.says(document="mutual-nda")

    assert choose(client, "An NDA").json()["document"] == "mutual-nda"


def test_draft_explains_an_unsupported_document_and_asks_about_the_closest(client, model):
    model.says(
        "I can’t generate an employment contract. The closest I can draft is a Professional "
        "Services Agreement, which covers services delivered under a statement of work.",
        nextQuestion="Would you like me to draft that instead?",
    )

    response = choose(client, "I need an employment contract").json()

    assert "document" not in response
    assert response["reply"].endswith(
        "under a statement of work. Would you like me to draft that instead?"
    )


def test_draft_tells_the_model_how_to_choose_a_document(client, model):
    model.says()

    choose(client)

    (call,) = model.calls
    instructions, *conversation = call["messages"]
    assert instructions == {"role": "system", "content": converse.CHOOSING_PROMPT}
    assert "- sla: Service Level Agreement." in instructions["content"]
    assert "not in the list" in instructions["content"]
    assert conversation == [GREETING, {"role": "user", "content": "I need a contract"}]
    schema = call["response_format"].model_json_schema()
    assert set(schema["properties"]) == {"document", "reply", "nextQuestion"}
    assert len(schema["properties"]["document"]["anyOf"][0]["enum"]) == 11


def test_draft_returns_the_reply_and_the_fields_the_user_gave(client, model):
    model.says(
        "Got it.",
        nextQuestion="Who signs for Acme?",
        providerCompany=" Acme Inc. ",
        customerCompany="Globex LLC",
        pilotPeriod="90 days",
        effectiveDate="2027-01-15",
        governingLaw="laws of the State of Delaware",
    )

    response = ask(client)

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Got it. Who signs for Acme?",
        "changes": {
            "providerCompany": "Acme Inc.",
            "customerCompany": "Globex LLC",
            "pilotPeriod": "90 days",
            "effectiveDate": "2027-01-15",
            "governingLaw": "laws of the State of Delaware",
        },
    }


def test_draft_leaves_out_values_the_document_already_has(client, model):
    model.says(providerCompany="Acme Inc.", providerName="Ada Lovelace", pilotPeriod="90 days")

    response = ask(client, values={"providerCompany": "Acme Inc.", "pilotPeriod": "90 days"})

    assert response.json()["changes"] == {"providerName": "Ada Lovelace"}


def test_draft_ignores_values_that_are_blank_or_too_long(client, model):
    model.says(providerCompany=" ", product="", pilotPeriod="x" * 4001)

    assert ask(client).json()["changes"] == {}


@pytest.mark.parametrize("date", ["2026-02-30", "15/01/2027", "next Monday", "0026-10-04", ""])
def test_draft_ignores_a_date_that_is_not_a_real_date(client, model, date):
    model.says(effectiveDate=date)

    assert ask(client).json()["changes"] == {}


def test_draft_asks_the_first_open_question_when_the_model_asks_nothing(client, model):
    model.says("Noted.", **ACME, **GLOBEX)

    assert ask(client).json()["reply"] == "Noted. What product or service is being piloted?"


@pytest.mark.parametrize("suggested", ["Please tell me about the provider.", "Thanks!", None])
def test_draft_asks_its_own_question_when_the_model_suggests_something_else(
    client, model, suggested
):
    model.says("Noted.", nextQuestion=suggested)

    assert ask(client).json()["reply"] == f"Noted. {PARTIES_QUESTION}"


def test_draft_does_not_repeat_a_question_the_reply_already_asks(client, model):
    model.says("Noted. Who is the provider?", nextQuestion="Who is the provider?")

    assert ask(client).json()["reply"] == "Noted. Who is the provider?"


def test_draft_keeps_asking_until_every_question_has_an_answer(client, model):
    """Whatever the model says, the reply asks about the next thing that is missing."""
    doc = documents.load()["psa"]
    values = {}
    for _ in range(len(doc.keys)):
        questions = documents.open_questions(doc, values)
        if not questions:
            break
        model.says("OK.", nextQuestion="All set.", acceptsAsked=True)

        response = ask(client, "ok", document="psa", values=values).json()

        topic = next(iter(questions))
        if response["changes"]:
            # A default was kept, or the optional terms were declined.
            assert topic in ("effectiveDate", "optional")
        else:
            assert response["reply"] == f"OK. {questions[topic]}"
            # The fake user answers the question that was asked.
            answered = [key for key in doc.keys if key.startswith(topic)]
            response["changes"] = {key: "Something" for key in answered}
        values.update(response["changes"])

    assert documents.open_questions(doc, values) == {}
    assert response["reply"] == f"OK. {chat.COMPLETE}"


def test_draft_records_the_default_the_user_agrees_to_keep(client, model):
    model.says("Keeping today.", acceptsAsked=True)
    values = {**FINISHED, "effectiveDate": ""}

    response = ask(client, "keep it", values=values).json()

    assert response["changes"] == {"effectiveDate": "2026-10-06"}
    assert response["reply"] == f"Keeping today. {chat.COMPLETE}"


def test_draft_prefers_the_value_the_user_gave_to_the_default(client, model):
    model.says("Next Monday it is.", acceptsAsked=True, effectiveDate="2026-10-12")

    response = ask(client, "next Monday", values={**FINISHED, "effectiveDate": ""}).json()

    assert response["changes"] == {"effectiveDate": "2026-10-12"}


def test_draft_only_believes_the_user_accepted_what_was_asked_about(client, model):
    model.says("Keeping it.", acceptsAsked=True)

    # The parties are still missing, so the default has not been asked about yet.
    assert ask(client, "keep it").json()["changes"] == {}


def test_draft_records_none_for_the_optional_terms_the_user_declines(client, model):
    model.says("No extras.", acceptsAsked=True)
    values = {
        "providerCompany": "Acme Inc.",
        "providerName": "Ada Lovelace",
        "providerTitle": "CEO",
        "providerNoticeAddress": "legal@acme.example",
        "companyCompany": "Globex LLC",
        "companyName": "Hank Scorpio",
        "companyTitle": "President",
        "companyNoticeAddress": "legal@globex.example",
        "agreementReference": "the Cloud Service Agreement dated March 1, 2026",
        "baaEffectiveDate": "2026-10-06",
        "breachNotificationPeriod": "5 business days",
    }

    response = ask(client, "none", document="baa", values=values).json()

    assert response["changes"] == {"limitations": "None"}
    assert response["reply"] == f"No extras. {chat.COMPLETE}"


def test_draft_offers_the_optional_terms_that_are_left_after_the_user_sets_one(client, model):
    model.says("Added.", supportChannel="help@acme.example")
    values = {
        **ACME,
        **GLOBEX,
        "agreementReference": "the Cloud Service Agreement dated March 1, 2026",
        "subscriptionPeriod": "1 year",
        "targetUptime": "99.9%",
        "uptimeCredit": "5% of that month’s fees",
    }

    response = ask(client, "support at help@acme.example", document="sla", values=values).json()

    assert response["changes"] == {"supportChannel": "help@acme.example"}
    assert response["reply"] == (
        "Added. You can also set these optional terms: Target Response Time, Response Time "
        "Credit and Scheduled Downtime. Would you like to add any of them, or leave them out?"
    )


def test_draft_does_not_say_complete_again_on_later_messages(client, model):
    model.says("Hank is now the CEO.", customerTitle="CEO")

    response = ask(client, "Make Hank the CEO", values=FINISHED).json()

    assert response == {"reply": "Hank is now the CEO.", "changes": {"customerTitle": "CEO"}}


def test_draft_hands_over_when_the_user_asks_for_another_document(client, model):
    model.says("Switching.", document="csa", providerCompany="Acme Inc.")

    response = ask(client, "Actually make it a cloud service agreement", values=ACME)

    assert response.json() == {"reply": "", "changes": {}, "document": "csa"}


def test_draft_stays_with_a_document_the_user_has_only_just_chosen(client, model):
    model.says("Starting a Pilot Agreement.", document="csa", providerCompany="Acme Inc.")

    response = ask(client, "A pilot for Acme", fresh=True).json()

    assert response == {
        "reply": (
            "Starting a Pilot Agreement. What are the signer’s name, signer’s title and notice "
            "address for Acme Inc.?"
        ),
        "changes": {"providerCompany": "Acme Inc."},
    }


def test_draft_asks_the_model_as_the_project_requires(client, model):
    model.says()

    ask(client)

    (call,) = model.calls
    assert call["model"] == "openrouter/openai/gpt-oss-120b"
    assert call["extra_body"] == {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
    assert call["response_format"] is converse.schema("pilot-agreement")
    assert call["reasoning_effort"] == "low"
    assert call["timeout"] == 30
    assert call["max_tokens"] == 2000


def test_draft_gives_the_model_the_document_the_values_and_the_date(client, model):
    model.says()

    ask(client, "We’re Acme", values={"governingLaw": "Delaware"}, fresh=True)

    instructions, context, *conversation = model.calls[0]["messages"]
    assert instructions["role"] == "system"
    assert "draft a Pilot Agreement" in instructions["content"]
    assert "- providerNoticeAddress: an email or postal address" in instructions["content"]
    assert (
        "- effectiveDate: Effective Date: the date the agreement starts, as yyyy-mm-dd, "
        "default: today." in instructions["content"]
    )
    assert "- csa: Cloud Service Agreement." in instructions["content"]
    assert context["content"].startswith("The user has just chosen this document")
    assert "Today is Tuesday, 2026-10-06." in context["content"]
    assert "Monday 2026-10-12" in context["content"]
    assert '"governingLaw": "Delaware"' in context["content"]
    assert '"pilotPeriod": ""' in context["content"]
    assert conversation == [GREETING, {"role": "user", "content": "We’re Acme"}]


def test_draft_tells_the_model_which_questions_are_still_open(client, model):
    model.says()

    ask(client, values={**FINISHED, "effectiveDate": "", "chosenCourts": ""})

    context = model.calls[0]["messages"][1]["content"]
    assert "just chosen" not in context
    assert context.split("latest message:\n")[1] == (
        "1. The agreement is set to start today. Keep that, or choose another Effective Date?\n"
        "2. Which courts should hear disputes? For example, the state or federal courts located "
        "in New Castle County, Delaware."
    )


def test_draft_tells_the_model_when_no_questions_are_open(client, model):
    model.says("Sure.")

    ask(client, values=FINISHED)

    assert model.calls[0]["messages"][1]["content"].endswith("latest message:\nNone.")


@pytest.mark.parametrize("document", [None, *(id for id in documents.load() if id != "mutual-nda")])
def test_the_model_schema_is_flat_and_requires_every_field(document):
    schema = converse.schema(document).model_json_schema()

    # Strict Structured Outputs reject optional properties, and nesting is easy to get wrong.
    assert set(schema["required"]) == set(schema["properties"])
    assert "$defs" not in schema
    assert document not in schema["properties"]["document"]["anyOf"][0]["enum"]
    assert len(schema["properties"]) <= 40


def test_the_model_schema_has_a_field_for_everything_in_the_document():
    doc = documents.load()["baa"]

    assert list(converse.schema("baa").model_fields) == [
        *doc.keys,
        "acceptsAsked",
        "document",
        "reply",
        "nextQuestion",
    ]
    assert doc.keys[:4] == [
        "providerCompany",
        "providerName",
        "providerTitle",
        "providerNoticeAddress",
    ]


def test_draft_is_unavailable_without_an_api_key(client, model, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY")

    response = ask(client)

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]
    assert model.calls == []


def test_draft_reports_a_failure_when_the_model_cannot_be_reached(client, model):
    model.answer = RuntimeError("upstream exploded: secret-details")

    response = ask(client)

    assert response.status_code == 502
    assert "secret-details" not in response.text


@pytest.mark.parametrize("answer", ["not json", "{}", '{"reply": "Hi"}', None])
def test_draft_reports_a_failure_when_the_model_answer_is_unusable(client, model, answer):
    model.answer = answer

    assert ask(client).status_code == 502
    assert choose(client).status_code == 502


def test_draft_reports_a_failure_when_there_is_nothing_to_say(client, model):
    model.says("   ")

    assert ask(client, values=FINISHED).status_code == 502


@pytest.mark.parametrize(
    "overrides",
    [
        {"messages": []},
        {"messages": [GREETING]},
        {"messages": [{"role": "user", "content": "x" * 4001}]},
        {"messages": [{"role": "user", "content": "Hi"}] * 41},
        {"today": "tomorrow"},
        {"today": "9999-12-31"},
        {"document": "employment-contract"},
        # The Mutual NDA is drafted by /api/chat.
        {"document": "mutual-nda"},
        {"values": {"mndaTerm": "expires"}},
        {"values": {"product": "x" * 4001}},
        {"values": {"product": None}},
        {"document": None, "values": {"product": "Widgets"}},
    ],
)
def test_draft_rejects_a_malformed_request(client, model, overrides):
    assert ask(client, **overrides).status_code == 422
    assert model.calls == []
