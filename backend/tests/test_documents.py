import json
import re
from datetime import date
from pathlib import Path

import pytest

from app import chat, documents

ROOT = Path(__file__).resolve().parents[2]
VARIABLE = re.compile(r'<span class="[a-z]+_link"[^>]*>([^<]+)</span>')
DOCUMENTS = documents.load()
# The documents drafted from their spec, which is all of them but the Mutual NDA.
DRAFTED = [doc for doc in DOCUMENTS.values() if not doc.engine]
PILOT = DOCUMENTS["pilot-agreement"]
PSA = DOCUMENTS["psa"]
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


def spec(doc):
    """The document as written in the specs file, with the parts the backend does not read."""
    specs = json.loads((ROOT / "documents" / "specs.json").read_text(encoding="utf-8"))
    return next(entry for entry in specs["documents"] if entry["id"] == doc.id)


def template_variables(doc) -> set[str]:
    template = (ROOT / "templates" / doc.template).read_text(encoding="utf-8")
    return set(VARIABLE.findall(template))


def test_there_is_a_document_for_every_template_in_the_catalog():
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    templates = {entry["filename"] for entry in catalog}

    # The Mutual NDA's cover page is part of the Mutual NDA.
    assert {doc.template for doc in DOCUMENTS.values()} == templates - {"Mutual-NDA-coverpage.md"}
    assert len(DOCUMENTS) == 11


def test_only_the_mutual_nda_has_its_own_chat():
    assert [doc.id for doc in DOCUMENTS.values() if doc.engine] == [documents.NDA]


@pytest.mark.parametrize("doc", DRAFTED, ids=lambda doc: doc.id)
def test_a_document_accounts_for_every_variable_in_its_template(doc):
    entry = spec(doc)
    filled = {
        variable
        for field in entry["fields"]
        for variable in field.get("variables", [field["label"]])
    }
    parties = {f"{party.label}{suffix}" for party in doc.parties for suffix in ("", "'s", "’s")}
    terms = set(entry.get("terms", []))
    variables = template_variables(doc)

    assert variables - parties - filled - terms == set()
    # Nothing is listed that the template does not use, so a renamed variable is noticed.
    assert filled - variables == set()
    assert terms - variables == set()
    assert filled & terms == set()


@pytest.mark.parametrize("doc", DRAFTED, ids=lambda doc: doc.id)
def test_a_document_is_well_formed(doc):
    assert len(doc.parties) == 2
    assert len(doc.keys) == len(set(doc.keys))
    assert not set(doc.keys) & {"acceptsAsked", "document", "reply", "nextQuestion"}
    for field in doc.fields:
        # An optional term is offered with the others, so it has no question of its own.
        assert bool(field.ask) != field.optional, field.key
        assert not (field.optional and field.default), field.key
        assert field.kind == "date" or not field.default, field.key


@pytest.mark.parametrize("doc", DRAFTED, ids=lambda doc: doc.id)
def test_every_question_about_a_document_is_a_question(doc):
    questions = documents.open_questions(doc, {})

    assert all(chat.is_question(question) for question in questions.values())


def test_questions_come_in_the_order_they_are_asked():
    assert list(documents.open_questions(PSA, {})) == [
        "provider",
        "customer",
        "services",
        "deliverables",
        "fees",
        "paymentPeriod",
        "sowTerm",
        "effectiveDate",
        "generalCapAmount",
        "governingLaw",
        "chosenCourts",
        "optional",
    ]


def test_a_question_is_open_until_it_has_a_value():
    values = {
        **ACME,
        **GLOBEX,
        "product": "Widgets",
        "pilotPeriod": " ",
        "governingLaw": "Delaware",
    }

    assert list(documents.open_questions(PILOT, values)) == [
        "pilotPeriod",
        "effectiveDate",
        "generalCapAmount",
        "chosenCourts",
    ]


def test_a_party_is_asked_for_whatever_is_missing():
    values = {**ACME, "providerTitle": "", "customerCompany": "Globex LLC"}

    questions = documents.open_questions(PILOT, values)

    assert questions["provider"] == "What is the signer’s title for Acme Inc.?"
    assert questions["customer"] == (
        "What are the signer’s name, signer’s title and notice address for Globex LLC?"
    )
    assert documents.open_questions(PILOT, {})["customer"] == (
        "What are the company, signer’s name, signer’s title and notice address for the Customer?"
    )


def test_the_optional_terms_are_offered_together_until_each_has_a_value():
    baa = DOCUMENTS["baa"]
    design = DOCUMENTS["design-partner-agreement"]

    assert documents.open_questions(baa, {})["optional"] == (
        "You can also set these optional terms: Limitations. Would you like to add any of them, "
        "or leave them out?"
    )
    assert "optional" not in documents.open_questions(design, {"fees": "None"})
    assert "optional" not in documents.open_questions(PILOT, {})
    remaining = documents.open_questions(PSA, {"dpa": "None", "rejectionPeriod": "5 days"})
    assert "Resubmission Period, Time of Assignment" in remaining["optional"]
    assert "DPA" not in remaining["optional"]
    assert "Rejection Period" not in remaining["optional"]


def test_accepting_a_default_records_it():
    today = date(2026, 10, 6)

    assert documents.accepted(PILOT, "effectiveDate", {}, today) == {"effectiveDate": "2026-10-06"}
    # There is nothing to accept in a question that offers no default.
    assert documents.accepted(PILOT, "pilotPeriod", {}, today) == {}
    assert documents.accepted(PILOT, "provider", {}, today) == {}


def test_declining_the_optional_terms_records_none_for_those_not_set():
    sla = DOCUMENTS["sla"]

    declined = documents.accepted(
        sla, "optional", {"supportChannel": "help@acme.example"}, date.min
    )

    assert declined == {
        "targetResponseTime": "None",
        "responseTimeCredit": "None",
        "scheduledDowntime": "None",
    }


def test_the_model_is_told_about_every_document():
    catalog = documents.catalog().splitlines()

    assert len(catalog) == 11
    assert catalog[0].startswith("- mutual-nda: Mutual Non-Disclosure Agreement. Two parties")
    assert documents.names().startswith("Mutual Non-Disclosure Agreement, Cloud Service Agreement")


def test_the_specs_can_be_read_from_another_place(tmp_path, monkeypatch):
    path = tmp_path / "specs.json"
    path.write_text(
        json.dumps(
            {"documents": [{"id": "x", "name": "X", "template": "x.md", "summary": "An X."}]}
        )
    )
    monkeypatch.setenv("SPECS_PATH", str(path))
    documents.load.cache_clear()

    try:
        assert list(documents.load()) == ["x"]
    finally:
        monkeypatch.undo()
        documents.load.cache_clear()
