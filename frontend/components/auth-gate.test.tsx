import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthGate } from "@/components/auth-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { clearSession, getSession, setSession } from "@/lib/session";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ADA = { id: 1, email: "ada@example.com" };

beforeEach(() => {
  clearSession();
});

afterEach(() => {
  cleanup();
  router.replace.mockReset();
  vi.unstubAllGlobals();
});

function renderPlatform() {
  render(
    <AuthGate>
      <p>The platform</p>
      <SignOutButton />
    </AuthGate>,
  );
}

describe("AuthGate", () => {
  test("sends a visitor who is not signed in to the login screen", () => {
    renderPlatform();

    expect(screen.queryByText("The platform")).toBeNull();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  test("shows the platform to a signed-in user", () => {
    setSession(ADA);

    renderPlatform();

    expect(screen.getByText("The platform")).toBeDefined();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("shows the platform as soon as the user signs in", () => {
    renderPlatform();

    act(() => setSession(ADA));

    expect(screen.getByText("The platform")).toBeDefined();
  });

  test("says it is opening, in the server render, where nobody is signed in yet", () => {
    setSession(ADA);

    const html = renderToString(
      <AuthGate>
        <p>The platform</p>
      </AuthGate>,
    );

    expect(html).not.toContain("The platform");
    expect(html).toContain("Opening Prelegal…");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("SignOutButton", () => {
  test("ends the session and returns the user to the login screen", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    setSession(ADA);
    renderPlatform();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(getSession()).toBeNull();
    expect(screen.queryByText("The platform")).toBeNull();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  test("leaves the user signed in when the backend cannot be told", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    setSession(ADA);
    renderPlatform();
    const button = screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement;

    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(getSession()).toEqual(ADA);
    expect(screen.getByText("The platform")).toBeDefined();
  });
});
