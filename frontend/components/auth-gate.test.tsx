import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthGate } from "@/components/auth-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession, setSession } from "@/lib/session";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  router.replace.mockReset();
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
    setSession("ada@example.com");

    renderPlatform();

    expect(screen.getByText("The platform")).toBeDefined();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("shows the platform as soon as the user signs in", () => {
    renderPlatform();

    act(() => setSession("ada@example.com"));

    expect(screen.getByText("The platform")).toBeDefined();
  });

  test("leaves the platform out of the server render, where nobody is signed in yet", () => {
    setSession("ada@example.com");

    const html = renderToString(
      <AuthGate>
        <p>The platform</p>
      </AuthGate>,
    );

    expect(html).not.toContain("The platform");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("SignOutButton", () => {
  test("signs the user out and returns them to the login screen", () => {
    setSession("ada@example.com");
    renderPlatform();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(getSession()).toBeNull();
    expect(screen.queryByText("The platform")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
