import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NdaChat } from "@/components/nda-chat";
import { defaultNdaForm, type NdaChanges } from "@/lib/nda";

const onChanges = vi.fn<(changes: NdaChanges) => void>();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 9));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onChanges.mockReset();
});

function renderChat() {
  render(<NdaChat form={defaultNdaForm} onChanges={onChanges} />);
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

const says = (reply: string, changes: NdaChanges = {}, settled: string[] = []) => () =>
  Response.json({ reply, changes, settled });

const fails = (status: number, body: unknown) => () => Response.json(body, { status });

function write(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

function send(text: string) {
  write(text);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("NdaChat", () => {
  test("opens with a greeting without asking the assistant", () => {
    const { fetch } = assistantAnswers();

    const conversation = renderChat();

    expect(conversation.getByText(/which two companies are entering into the NDA\?/)).toBeDefined();
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

  test("passes on the changes the assistant makes", async () => {
    assistantAnswers(says("Noted.", { governingLaw: "Delaware", party1: { company: "Acme Inc." } }));
    renderChat();

    send("Acme, under Delaware law");

    await waitFor(() =>
      expect(onChanges).toHaveBeenCalledExactlyOnceWith({
        governingLaw: "Delaware",
        party1: { company: "Acme Inc." },
      }),
    );
  });

  test("sends the conversation, the agreement and today's date", async () => {
    const { fetch, request } = assistantAnswers(says("Noted."));
    renderChat();

    send("  Acme and Globex  ");
    await screen.findByText("Noted.");

    expect(fetch.mock.calls[0][0]).toBe("/api/chat");
    expect(request(0)).toEqual({
      messages: [
        { role: "assistant", content: expect.stringContaining("which two companies") },
        { role: "user", content: "Acme and Globex" },
      ],
      form: defaultNdaForm,
      settled: [],
      today: "2026-10-04",
    });
  });

  test("sends back the defaults the user has already agreed to keep", async () => {
    const { request } = assistantAnswers(
      says("Keeping the purpose.", {}, ["purpose"]),
      says("Keeping the date.", {}, ["purpose", "effectiveDate"]),
    );
    renderChat();

    send("keep it");
    await screen.findByText("Keeping the purpose.");
    send("keep that too");
    await screen.findByText("Keeping the date.");

    expect(request(1).settled).toEqual(["purpose"]);
    expect(request(1).messages.map((message: { content: string }) => message.content)).toEqual([
      expect.stringContaining("which two companies"),
      "keep it",
      "Keeping the purpose.",
      "keep that too",
    ]);
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

    answer(Response.json({ reply: "Noted.", changes: {}, settled: [] }));
    await screen.findByText("Noted.");
    expect(screen.queryByRole("status")).toBeNull();
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
    expect(onChanges).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await conversation.findByText("Thanks for waiting.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    // The message is sent again as it was, not added a second time.
    expect(request(1).messages).toEqual(request(0).messages);
    expect(conversation.getAllByText("Acme and Globex")).toHaveLength(1);
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
});
