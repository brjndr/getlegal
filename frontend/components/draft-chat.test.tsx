import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DraftChat, type Turn } from "@/components/draft-chat";
import type { ChatMessage } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import { emptyDraft, type Draft } from "@/lib/draft";
import { defaultNdaForm } from "@/lib/nda";

const DOCUMENTS: DocumentSpec[] = [
  { id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", template: "", engine: "nda" },
  { id: "pilot-agreement", name: "Pilot Agreement", template: "" },
  { id: "csa", name: "Cloud Service Agreement", template: "" },
];

const onDraft = vi.fn<(draft: Draft) => void>();
const onTurn = vi.fn<(turn: Turn) => void>();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 9));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onDraft.mockReset();
  onTurn.mockReset();
});

/** Keeps the draft the chat reports, as the page around it does. */
function Page({ start, opened }: { start: Draft; opened?: ChatMessage[] }) {
  const [draft, setDraft] = useState(start);
  return (
    <>
      <DraftChat
        documents={DOCUMENTS}
        draft={draft}
        opened={opened}
        onTurn={(turn) => {
          onDraft(turn.draft);
          onTurn(turn);
          setDraft(turn.draft);
        }}
      />
      <button>Download PDF</button>
    </>
  );
}

function renderChat(document: string | null = "pilot-agreement", opened?: ChatMessage[]) {
  render(<Page start={emptyDraft(document)} opened={opened} />);
  return within(screen.getByRole("log"));
}

/** Makes the assistant give these answers, one per request. */
function assistantAnswers(...answers: (() => Response | Promise<Response>)[]) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
  for (const answer of answers) fetch.mockImplementationOnce(async () => answer());
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    request: (index: number) => JSON.parse(fetch.mock.calls[index][1].body as string),
  };
}

const says =
  (reply: string, changes: object = {}, rest: object = {}) =>
  () =>
    Response.json({ reply, changes, ...rest });

const chooses = (document: string) => says("", {}, { document });

const fails = (status: number, body: unknown) => () => Response.json(body, { status });

const contents = (messages: { content: string }[]) => messages.map((message) => message.content);

function write(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

function send(text: string) {
  write(text);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("DraftChat", () => {
  test("opens by offering the documents, without asking the assistant", () => {
    const { fetch } = assistantAnswers();

    const conversation = renderChat(null);

    expect(
      conversation.getByText(
        /I can prepare: Mutual Non-Disclosure Agreement, Pilot Agreement, Cloud Service Agreement\. Which do you need\?/,
      ),
    ).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("shows the user's message and the assistant's reply", async () => {
    assistantAnswers(says("Thanks. Who signs for Acme?"));
    const conversation = renderChat();

    send("Acme and Globex");

    expect(conversation.getByText("Acme and Globex")).toBeDefined();
    expect(await conversation.findByText("Thanks. Who signs for Acme?")).toBeDefined();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
  });

  test("asks the assistant to help choose while there is no document", async () => {
    const { fetch, request } = assistantAnswers(says("Is this for a trial of your product?"));
    renderChat(null);

    send("  I need a contract  ");
    await screen.findByText("Is this for a trial of your product?");

    expect(fetch.mock.calls[0][0]).toBe("/api/draft");
    expect(request(0)).toEqual({
      messages: [
        { role: "assistant", content: expect.stringContaining("Which do you need?") },
        { role: "user", content: "I need a contract" },
      ],
      document: null,
      values: {},
      today: "2026-10-04",
      fresh: false,
    });
    expect(onDraft).toHaveBeenCalledExactlyOnceWith(emptyDraft());
  });

  test("starts the document the user chooses, with the message that chose it", async () => {
    const { fetch, request } = assistantAnswers(
      chooses("pilot-agreement"),
      says("Starting a Pilot Agreement. Who signs for Acme?", { providerCompany: "Acme Inc." }),
    );
    const conversation = renderChat(null);

    send("A pilot for Acme");

    expect(await conversation.findByText(/Starting a Pilot Agreement/)).toBeDefined();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/draft", "/api/draft"]);
    expect(request(1)).toEqual({
      // The greeting is about choosing a document, which is now done.
      messages: [{ role: "user", content: "A pilot for Acme" }],
      document: "pilot-agreement",
      values: {},
      today: "2026-10-04",
      fresh: true,
    });
    expect(onDraft).toHaveBeenCalledExactlyOnceWith({
      ...emptyDraft("pilot-agreement"),
      values: { providerCompany: "Acme Inc." },
    });
    // The assistant's empty answer to the first request is not a message.
    expect(conversation.getAllByText(/./, { selector: "p" })).toHaveLength(3);
  });

  test("drafts the Mutual NDA with its own chat", async () => {
    const { fetch, request } = assistantAnswers(
      chooses("mutual-nda"),
      says("Starting the NDA.", { party1: { company: "Acme Inc." } }, { settled: [] }),
      says("Keeping the purpose.", {}, { settled: ["purpose"] }),
      says("Keeping the date.", {}, { settled: ["purpose", "effectiveDate"] }),
    );
    renderChat(null);

    send("An NDA for Acme");
    await screen.findByText("Starting the NDA.");
    send("keep it");
    await screen.findByText("Keeping the purpose.");
    send("keep that too");
    await screen.findByText("Keeping the date.");

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/draft",
      "/api/chat",
      "/api/chat",
      "/api/chat",
    ]);
    expect(request(1)).toEqual({
      messages: [{ role: "user", content: "An NDA for Acme" }],
      form: defaultNdaForm,
      settled: [],
      today: "2026-10-04",
      fresh: true,
    });
    const acme = { ...defaultNdaForm.party1, company: "Acme Inc." };
    expect(request(2).form.party1).toEqual(acme);
    expect(request(2).fresh).toBe(false);
    // The defaults the user has agreed to keep go back with the next message.
    expect(request(3).settled).toEqual(["purpose"]);
    expect(onDraft).toHaveBeenLastCalledWith({
      document: "mutual-nda",
      form: { ...defaultNdaForm, party1: acme },
      values: {},
      settled: ["purpose", "effectiveDate"],
    });
  });

  test("sends the agreement as it stands and the conversation about it", async () => {
    const { request } = assistantAnswers(
      says("Noted.", { governingLaw: "laws of the State of Delaware" }),
      says("Got it.", { pilotPeriod: "90 days" }),
    );
    renderChat();

    send("Delaware law");
    await screen.findByText("Noted.");
    send("90 days");
    await screen.findByText("Got it.");

    expect(request(1).values).toEqual({ governingLaw: "laws of the State of Delaware" });
    expect(contents(request(1).messages)).toEqual([
      expect.stringContaining("Which do you need?"),
      "Delaware law",
      "Noted.",
      "90 days",
    ]);
    expect(onDraft).toHaveBeenLastCalledWith({
      ...emptyDraft("pilot-agreement"),
      values: { governingLaw: "laws of the State of Delaware", pilotPeriod: "90 days" },
    });
  });

  test("starts afresh when the user asks for another document", async () => {
    const { request } = assistantAnswers(
      says("Noted.", { providerCompany: "Acme Inc." }),
      chooses("csa"),
      says("Starting a Cloud Service Agreement."),
      says("Got it.", { customerCompany: "Globex LLC" }),
    );
    const conversation = renderChat();

    send("Acme provides it");
    await screen.findByText("Noted.");
    send("Make it a cloud service agreement");
    await screen.findByText("Starting a Cloud Service Agreement.");
    send("Globex is the customer");
    await screen.findByText("Got it.");

    // The Pilot Agreement's values and the messages about it are left behind.
    expect(request(2)).toMatchObject({ document: "csa", values: {}, fresh: true });
    expect(contents(request(3).messages)).toEqual([
      "Make it a cloud service agreement",
      "Starting a Cloud Service Agreement.",
      "Globex is the customer",
    ]);
    expect(onDraft).toHaveBeenLastCalledWith({
      ...emptyDraft("csa"),
      values: { customerCompany: "Globex LLC" },
    });
    // The user still sees the whole conversation.
    expect(conversation.getByText("Acme provides it")).toBeDefined();
  });

  test("carries on with the same document when the assistant names one it cannot draft", async () => {
    const { fetch } = assistantAnswers(says("Sorry, I can’t draft that.", {}, { document: "will" }));
    renderChat();

    send("Write my will");

    expect(await screen.findByText("Sorry, I can’t draft that.")).toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(onDraft).toHaveBeenCalledExactlyOnceWith(emptyDraft("pilot-agreement"));
  });

  test("reports a failure when the assistant has nothing to say about the new document", async () => {
    assistantAnswers(chooses("csa"), chooses("pilot-agreement"));
    renderChat();

    send("A cloud service agreement");

    expect((await screen.findByRole("alert")).textContent).toContain("couldn’t reply");
    expect(onDraft).not.toHaveBeenCalled();
  });

  test("sends on Enter but not on Shift+Enter", async () => {
    const { fetch } = assistantAnswers(says("Noted."));
    renderChat();
    const message = screen.getByLabelText("Message");

    write("Acme and Globex");
    fireEvent.keyDown(message, { key: "Enter", shiftKey: true });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(message, { key: "Enter" });
    await screen.findByText("Noted.");
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("does not send an empty message", () => {
    const { fetch } = assistantAnswers();
    renderChat();

    write("   ");
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("shows that the assistant is thinking and holds further messages until it answers", async () => {
    let answer: (response: Response) => void = () => {};
    const { fetch } = assistantAnswers(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    renderChat();

    send("Acme and Globex");
    expect(await screen.findByRole("status")).toBeDefined();
    write("And another thing");
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();

    answer(Response.json({ reply: "Noted.", changes: {} }));
    await screen.findByText("Noted.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("puts the cursor back in the message box when the assistant has answered", async () => {
    assistantAnswers(says("Noted."));
    renderChat();
    const message = screen.getByLabelText("Message");
    const button = screen.getByRole("button", { name: "Send" });

    write("Acme and Globex");
    // Clicking a button moves the focus to it, and it is disabled while the assistant thinks.
    button.focus();
    fireEvent.click(button);

    expect(document.activeElement).toBe(message);
    button.focus();
    await screen.findByText("Noted.");
    await waitFor(() => expect(document.activeElement).toBe(message));
  });

  test("puts the cursor back in the message box when the assistant fails", async () => {
    assistantAnswers(fails(502, { detail: "Please try again." }), says("Thanks for waiting."));
    renderChat();
    const message = screen.getByLabelText("Message");

    send("Acme and Globex");
    message.blur();
    const retry = within(await screen.findByRole("alert")).getByRole("button");
    await waitFor(() => expect(document.activeElement).toBe(message));

    retry.focus();
    fireEvent.click(retry);
    await screen.findByText("Thanks for waiting.");

    // The button that had the focus went away with the error.
    await waitFor(() => expect(document.activeElement).toBe(message));
  });

  test("leaves the focus where the user has moved it", async () => {
    assistantAnswers(says("Noted."));
    renderChat();
    const download = screen.getByRole("button", { name: "Download PDF" });

    send("Acme and Globex");
    download.focus();
    await screen.findByText("Noted.");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    expect(document.activeElement).toBe(download);
  });

  test("keeps the user's message when the assistant fails, and tries again on request", async () => {
    const { fetch, request } = assistantAnswers(
      () => Promise.reject(new TypeError("Failed to fetch")),
      says("Thanks for waiting."),
    );
    const conversation = renderChat();

    send("Acme and Globex");
    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("couldn’t reply");
    expect(conversation.getByText("Acme and Globex")).toBeDefined();
    expect(onDraft).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await conversation.findByText("Thanks for waiting.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    // The message is sent again as it was, not added a second time.
    expect(request(1).messages).toEqual(request(0).messages);
    expect(conversation.getAllByText("Acme and Globex")).toHaveLength(1);
  });

  test("chooses the document again when starting it failed", async () => {
    const { request } = assistantAnswers(
      chooses("csa"),
      fails(502, { detail: "Please try again." }),
      chooses("csa"),
      says("Starting a Cloud Service Agreement."),
    );
    renderChat();

    send("A cloud service agreement");
    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button"));
    await screen.findByText("Starting a Cloud Service Agreement.");

    // Nothing was kept from the attempt that failed.
    expect(request(2).document).toBe("pilot-agreement");
    expect(request(3)).toMatchObject({ document: "csa", fresh: true });
  });

  test("shows the reason the backend gives for a failure", async () => {
    assistantAnswers(fails(503, { detail: "The assistant isn’t set up yet." }));
    renderChat();

    send("Acme and Globex");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The assistant isn’t set up yet.",
    );
  });

  test("shows a general message for a failure the backend does not explain", async () => {
    assistantAnswers(fails(422, { detail: [{ msg: "Field required" }] }));
    renderChat();

    send("Acme and Globex");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn’t reply");
    expect(alert.textContent).not.toContain("422");
  });

  test("hands over the agreement and the conversation about it after each reply", async () => {
    assistantAnswers(
      says("Noted.", { providerCompany: "Acme Inc." }),
      chooses("csa"),
      says("Starting a Cloud Service Agreement."),
      says("Got it.", { customerCompany: "Globex LLC" }),
    );
    renderChat();

    send("Acme provides it");
    await screen.findByText("Noted.");
    send("Make it a cloud service agreement");
    await screen.findByText("Starting a Cloud Service Agreement.");
    send("Globex is the customer");
    await screen.findByText("Got it.");

    const turns = onTurn.mock.calls.map(([turn]) => ({
      ...turn,
      draft: turn.draft.document,
      messages: contents(turn.messages),
    }));
    expect(turns).toEqual([
      {
        draft: "pilot-agreement",
        messages: [expect.stringContaining("Which do you need?"), "Acme provides it", "Noted."],
        started: false,
      },
      {
        draft: "csa",
        // Only what was said about the new document, from the message that asked for it.
        messages: ["Make it a cloud service agreement", "Starting a Cloud Service Agreement."],
        started: true,
      },
      {
        draft: "csa",
        messages: [
          "Make it a cloud service agreement",
          "Starting a Cloud Service Agreement.",
          "Globex is the customer",
          "Got it.",
        ],
        started: false,
      },
    ]);
  });

  test("hands nothing over when the assistant fails", async () => {
    assistantAnswers(fails(502, { detail: "The assistant couldn’t reply just now." }));
    renderChat();

    send("Acme provides it");
    await screen.findByRole("alert");

    expect(onTurn).not.toHaveBeenCalled();
  });

  test("carries on with the conversation of a saved document", async () => {
    const opened: ChatMessage[] = [
      { role: "user", content: "A pilot for Acme" },
      { role: "assistant", content: "Who is the customer?" },
    ];
    const { fetch, request } = assistantAnswers(says("Thanks. Who signs for Globex?"));
    const conversation = renderChat("pilot-agreement", opened);

    // There is no greeting: the conversation is the one that was saved.
    expect(contents(opened)).toEqual(
      conversation.getAllByText(/./, { selector: "p" }).map((message) => message.lastChild?.textContent),
    );
    expect(fetch).not.toHaveBeenCalled();

    send("Globex");
    await screen.findByText("Thanks. Who signs for Globex?");

    expect(contents(request(0).messages)).toEqual(["A pilot for Acme", "Who is the customer?", "Globex"]);
    expect(contents(onTurn.mock.calls[0][0].messages)).toEqual([
      "A pilot for Acme",
      "Who is the customer?",
      "Globex",
      "Thanks. Who signs for Globex?",
    ]);
  });
});
