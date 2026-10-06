import { afterEach, describe, expect, test, vi } from "vitest";
import { chat, ChatError, login, type ChatMessage } from "@/lib/api";
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

describe("chat", () => {
  const messages: ChatMessage[] = [{ role: "user", content: "Acme and Globex" }];

  test("posts the conversation to the backend and returns the assistant's turn", async () => {
    const turn = { reply: "Noted.", changes: { governingLaw: "Delaware" }, settled: ["purpose"] };
    const fetch = vi.fn(async () => Response.json(turn));
    vi.stubGlobal("fetch", fetch);

    const result = await chat(messages, defaultNdaForm, ["purpose"], "2026-10-04");

    expect(result).toEqual(turn);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        form: defaultNdaForm,
        settled: ["purpose"],
        today: "2026-10-04",
      }),
    });
  });

  test("fails with the backend's explanation when it gives one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "Not set up yet." }, { status: 503 })),
    );

    const failure = chat(messages, defaultNdaForm, [], "2026-10-04");

    await expect(failure).rejects.toBeInstanceOf(ChatError);
    await expect(failure).rejects.toThrow("Not set up yet.");
  });

  test.each([
    ["has no explanation", () => new Response("Bad Gateway", { status: 502 })],
    ["explains with a list of problems", () => Response.json({ detail: [{}] }, { status: 422 })],
  ])("fails with the status when the backend %s", async (_, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));

    const failure = chat(messages, defaultNdaForm, [], "2026-10-04");

    await expect(failure).rejects.not.toBeInstanceOf(ChatError);
    await expect(failure).rejects.toThrow(/status (502|422)/);
  });
});
