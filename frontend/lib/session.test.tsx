import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const ADA = { id: 1, email: "ada@example.com" };

let session: typeof import("@/lib/session");
let api: typeof import("@/lib/api");

beforeEach(async () => {
  // Who is signed in is kept for as long as the page is open, so each test opens it afresh.
  vi.resetModules();
  session = await import("@/lib/session");
  api = await import("@/lib/api");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Makes the backend answer the question of who is signed in. */
function backendSays(respond: () => Response | Promise<Response>) {
  const fetch = vi.fn(async () => respond());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function Who() {
  const user = session.useSession();
  return <p>{user === undefined ? "unknown" : (user?.email ?? "nobody")}</p>;
}

describe("useSession", () => {
  test("asks the backend who is signed in, sending the browser's session", async () => {
    const fetch = backendSays(() => Response.json(ADA));

    render(<Who />);

    expect(screen.getByText("unknown")).toBeDefined();
    expect(await screen.findByText("ada@example.com")).toBeDefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/me", {
      method: "GET",
      credentials: "include",
    });
  });

  test.each([
    ["the backend knows no session", () => Response.json({ detail: "Sign in." }, { status: 401 })],
    ["the backend cannot be reached", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("has nobody signed in when %s", async (_, respond) => {
    backendSays(respond);

    render(<Who />);

    expect(await screen.findByText("nobody")).toBeDefined();
    expect(session.sessionEnded()).toBe(false);
  });

  test("asks once, however many parts of the page want to know", async () => {
    const fetch = backendSays(() => Response.json(ADA));

    render(
      <>
        <Who />
        <Who />
      </>,
    );

    expect(await screen.findAllByText("ada@example.com")).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("follows signing in and out without asking the backend", () => {
    const fetch = backendSays(() => Response.json(ADA));
    session.clearSession();
    render(<Who />);
    expect(screen.getByText("nobody")).toBeDefined();

    act(() => session.setSession(ADA));
    expect(screen.getByText("ada@example.com")).toBeDefined();
    expect(session.getSession()).toEqual(ADA);

    act(() => session.clearSession());
    expect(screen.getByText("nobody")).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("keeps a sign-in that happens while the backend is still answering", async () => {
    let answer: (response: Response) => void = () => {};
    backendSays(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(<Who />);

    act(() => session.setSession(ADA));
    await act(async () => answer(Response.json({}, { status: 401 })));

    expect(screen.getByText("ada@example.com")).toBeDefined();
  });

  test("signs the user out when the backend stops recognising them", async () => {
    session.setSession(ADA);
    render(<Who />);
    backendSays(() => Response.json({ detail: "Sign in to continue." }, { status: 401 }));

    await act(() => api.listDocuments().catch(() => {}));

    expect(screen.getByText("nobody")).toBeDefined();
    expect(session.sessionEnded()).toBe(true);
  });

  test("forgets that a session ended once someone signs in", async () => {
    session.setSession(ADA);
    backendSays(() => Response.json({}, { status: 401 }));
    await api.listDocuments().catch(() => {});

    session.setSession(ADA);

    expect(session.sessionEnded()).toBe(false);
  });

  test("is unknown in the server render so hydration matches", () => {
    session.setSession(ADA);

    expect(renderToString(<Who />)).toContain("unknown");
  });
});
