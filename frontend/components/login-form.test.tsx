import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LoginForm } from "@/components/login-form";
import { getSession, setSession } from "@/lib/session";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  router.replace.mockReset();
  vi.unstubAllGlobals();
});

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  test("signs the user in and brings them into the platform", async () => {
    const fetch = vi.fn(async () => Response.json({ id: 1, email: "ada@example.com" }));
    vi.stubGlobal("fetch", fetch);
    render(<LoginForm />);

    type(screen.getByLabelText("Email"), "Ada@Example.com");
    type(screen.getByLabelText("Password"), "anything");
    submit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    // The backend decides how the email is written.
    expect(getSession()).toBe("ada@example.com");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "Ada@Example.com", password: "anything" }),
      }),
    );
  });

  test("does not need a password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: 1, email: "ada@example.com" })),
    );
    render(<LoginForm />);

    type(screen.getByLabelText("Email"), "ada@example.com");
    submit();

    await waitFor(() => expect(getSession()).toBe("ada@example.com"));
  });

  test("shows that it is working while the request is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<LoginForm />);

    type(screen.getByLabelText("Email"), "ada@example.com");
    submit();

    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test.each([
    ["the backend rejects the email", async () => new Response("{}", { status: 422 })],
    ["the backend is unreachable", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("stays on the login screen when %s", async (_, respond) => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<LoginForm />);

    type(screen.getByLabelText("Email"), "ada@example.com");
    submit();

    expect((await screen.findByRole("alert")).textContent).toContain("couldn’t sign you in");
    expect(getSession()).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    // Ready for another attempt.
    expect(
      (screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("sends someone who is already signed in straight to the platform", () => {
    setSession("ada@example.com");

    render(<LoginForm />);

    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
