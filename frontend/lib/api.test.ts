import { afterEach, describe, expect, test, vi } from "vitest";
import { ChatError, converse, fetchTemplates, login, type ChatMessage } from "@/lib/api";
import { emptyDraft } from "@/lib/draft";
import { defaultNdaForm } from "@/lib/nda";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("login", () => {
  test("posts the credentials to the backend and returns the user", async () => {
    const fetch = vi.fn(async () => Response.json({ id: 7, email: "ada@example.com" }));
    vi.stubGlobal("fetch", fetch);

    const user = await login("ada@example.com", "secret");

    expect(user).toEqual({ id: 7, email: "ada@example.com" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "secret" }),
    });
  });

  test("fails when the backend rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 422 })),
    );

    await expect(login("not an email", "")).rejects.toThrow("status 422");
  });
});

describe("converse", () => {
  const messages: ChatMessage[] = [{ role: "user", content: "Acme and Globex" }];
  const nda = { ...emptyDraft("mutual-nda"), settled: ["purpose"] };

  test("posts the Mutual NDA to its own chat and returns the assistant's turn", async () => {
    const turn = { reply: "Noted.", changes: { governingLaw: "Delaware" }, settled: ["purpose"] };
    const fetch = vi.fn(async () => Response.json(turn));
    vi.stubGlobal("fetch", fetch);

    const result = await converse(nda, messages, "2026-10-04", true);

    expect(result).toEqual(turn);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        form: defaultNdaForm,
        settled: ["purpose"],
        today: "2026-10-04",
        fresh: true,
      }),
    });
  });

  test.each([
    ["another document", "pilot-agreement", { product: "Widgets" }],
    ["no document yet", null, {}],
  ])("posts %s to the chat for the other documents", async (_, document, values) => {
    const turn = { reply: "Noted.", changes: { pilotPeriod: "90 days" } };
    const fetch = vi.fn(async () => Response.json(turn));
    vi.stubGlobal("fetch", fetch);

    const draft = { ...emptyDraft(document), values };
    const result = await converse(draft, messages, "2026-10-04", false);

    expect(result).toEqual(turn);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, document, values, today: "2026-10-04", fresh: false }),
    });
  });

  test("fails with the backend's explanation when it gives one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "Not set up yet." }, { status: 503 })),
    );

    const failure = converse(nda, messages, "2026-10-04", false);

    await expect(failure).rejects.toBeInstanceOf(ChatError);
    await expect(failure).rejects.toThrow("Not set up yet.");
  });

  test.each([
    ["has no explanation", () => new Response("Bad Gateway", { status: 502 })],
    ["explains with a list of problems", () => Response.json({ detail: [{}] }, { status: 422 })],
  ])("fails with the status when the backend %s", async (_, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));

    const failure = converse(nda, messages, "2026-10-04", false);

    await expect(failure).rejects.not.toBeInstanceOf(ChatError);
    await expect(failure).rejects.toThrow(/status (502|422)/);
  });
});

describe("fetchTemplates", () => {
  test("tries again after a failure, then fetches the agreements only once", async () => {
    const templates = { csa: { title: "Cloud Service Agreement", clauses: [] } };
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => new Response("Not found", { status: 404 }))
      .mockImplementation(async () => Response.json(templates));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchTemplates()).rejects.toThrow("status 404");
    expect(await fetchTemplates()).toEqual(templates);
    expect(await fetchTemplates()).toEqual(templates);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/templates.json");
  });
});
