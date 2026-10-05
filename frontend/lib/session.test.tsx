import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { clearSession, getSession, setSession, useSession } from "@/lib/session";

function Session() {
  const session = useSession();
  return <p>{session === undefined ? "unknown" : (session ?? "signed out")}</p>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("session", () => {
  test("remembers who signed in until they sign out", () => {
    setSession("ada@example.com");
    expect(getSession()).toBe("ada@example.com");

    clearSession();
    expect(getSession()).toBeNull();
  });
});

describe("useSession", () => {
  test("follows signing in and out", () => {
    render(<Session />);
    expect(screen.getByText("signed out")).toBeDefined();

    act(() => setSession("ada@example.com"));
    expect(screen.getByText("ada@example.com")).toBeDefined();

    act(() => clearSession());
    expect(screen.getByText("signed out")).toBeDefined();
  });

  test("follows signing in from another tab", () => {
    render(<Session />);

    act(() => {
      localStorage.setItem("prelegal.user", "grace@example.com");
      window.dispatchEvent(new StorageEvent("storage"));
    });

    expect(screen.getByText("grace@example.com")).toBeDefined();
  });

  test("is unknown in the server render so hydration matches", () => {
    setSession("ada@example.com");

    expect(renderToString(<Session />)).toContain("unknown");
  });
});
