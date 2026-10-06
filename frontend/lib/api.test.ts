import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApiError,
  converse,
  deleteDocument,
  fetchTemplates,
  getMe,
  listDocuments,
  onSignedOut,
  openDocument,
  saveDocument,
  signIn,
  signOut,
  signUp,
  type ChatMessage,
} from "@/lib/api";
import { emptyDraft } from "@/lib/draft";
import { defaultNdaForm } from "@/lib/nda";

afterEach(() => {
  vi.unstubAllGlobals();
  onSignedOut(() => {});
});

const ADA = { id: 7, email: "ada@example.com" };
const JSON_HEADERS = { "Content-Type": "application/json" };

function backendSays(respond: () => Response) {
  const fetch = vi.fn(async () => respond());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("accounts", () => {
  test.each([
    ["signs in", signIn, "/api/login"],
    ["signs up", signUp, "/api/signup"],
  ])("%s with the credentials and returns the user", async (_, send, path) => {
    const fetch = backendSays(() => Response.json(ADA));

    const user = await send("ada@example.com", "secret");

    expect(user).toEqual(ADA);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(path, {
      method: "POST",
      credentials: "include",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: "ada@example.com", password: "secret" }),
    });
  });

  test("asks who is signed in", async () => {
    const fetch = backendSays(() => Response.json(ADA));

    expect(await getMe()).toEqual(ADA);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/me", {
      method: "GET",
      credentials: "include",
    });
  });

  test("signs out, which the backend answers with nothing", async () => {
    const fetch = backendSays(() => new Response(null, { status: 204 }));

    expect(await signOut()).toBeUndefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  test("fails with the backend's explanation of what was wrong", async () => {
    backendSays(() => Response.json({ detail: "Incorrect email or password." }, { status: 401 }));

    const failure = signIn("ada@example.com", "wrong");

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow("Incorrect email or password.");
    await expect(failure).rejects.toMatchObject({ status: 401 });
  });

  test("fails with the status when the backend lists problems with the request", async () => {
    backendSays(() => Response.json({ detail: [{}] }, { status: 422 }));

    await expect(signUp("not an email", "")).rejects.toThrow("POST /api/signup failed with status 422");
  });
});

describe("the session", () => {
  test("is reported as ended when the backend says nobody is signed in", async () => {
    const ended = vi.fn();
    onSignedOut(ended);
    backendSays(() => Response.json({ detail: "Sign in to continue." }, { status: 401 }));

    await expect(listDocuments()).rejects.toThrow("Sign in to continue.");

    expect(ended).toHaveBeenCalledTimes(1);
  });

  test.each([403, 404, 500, 502])("is left alone by a failure with status %i", async (status) => {
    const ended = vi.fn();
    onSignedOut(ended);
    backendSays(() => new Response("", { status }));

    await expect(listDocuments()).rejects.toThrow(`status ${status}`);

    expect(ended).not.toHaveBeenCalled();
  });
});

describe("saved documents", () => {
  const summary = { id: 3, document: "csa", parties: "Acme", updatedAt: "2026-10-06T10:00:00Z" };
  const state = {
    draft: { ...emptyDraft("csa"), document: "csa", values: { providerCompany: "Acme" } },
    messages: [{ role: "assistant" as const, content: "Who is the customer?" }],
  };

  test("lists the user's documents", async () => {
    const fetch = backendSays(() => Response.json([summary]));

    expect(await listDocuments()).toEqual([summary]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/documents", {
      method: "GET",
      credentials: "include",
    });
  });

  test("opens a document", async () => {
    const fetch = backendSays(() => Response.json({ ...summary, ...state }));

    expect(await openDocument(3)).toEqual({ ...summary, ...state });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/documents/3", {
      method: "GET",
      credentials: "include",
    });
  });

  test.each([
    ["a new document", null, "/api/documents", "POST"],
    ["over a saved document", 3, "/api/documents/3", "PUT"],
  ])("saves %s", async (_, id, path, method) => {
    const fetch = backendSays(() => Response.json(summary));

    expect(await saveDocument(id, state)).toEqual(summary);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(path, {
      method,
      credentials: "include",
      headers: JSON_HEADERS,
      body: JSON.stringify(state),
    });
  });

  test("deletes a document", async () => {
    const fetch = backendSays(() => new Response(null, { status: 204 }));

    expect(await deleteDocument(3)).toBeUndefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/documents/3", {
      method: "DELETE",
      credentials: "include",
    });
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
      credentials: "include",
      headers: JSON_HEADERS,
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
      credentials: "include",
      headers: JSON_HEADERS,
      body: JSON.stringify({ messages, document, values, today: "2026-10-04", fresh: false }),
    });
  });

  test("fails with the backend's explanation when it gives one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "Not set up yet." }, { status: 503 })),
    );

    const failure = converse(nda, messages, "2026-10-04", false);

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow("Not set up yet.");
  });

  test.each([
    ["has no explanation", () => new Response("Bad Gateway", { status: 502 })],
    ["explains with a list of problems", () => Response.json({ detail: [{}] }, { status: 422 })],
  ])("fails with the status when the backend %s", async (_, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));

    const failure = converse(nda, messages, "2026-10-04", false);

    await expect(failure).rejects.not.toBeInstanceOf(ApiError);
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
