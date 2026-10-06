import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthForm } from "@/components/auth-form";
import { listDocuments } from "@/lib/api";
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

function backendSays(respond: () => Response | Promise<Response>) {
  const fetch = vi.fn(async () => respond());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function fillIn(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

const password = () => screen.getByLabelText("Password") as HTMLInputElement;

describe("AuthForm", () => {
  test("signs the user in and brings them into the platform", async () => {
    const fetch = backendSays(() => Response.json(ADA));
    render(<AuthForm mode="sign-in" />);

    fillIn("Ada@Example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    // The backend decides how the email is written.
    expect(getSession()).toEqual(ADA);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/login",
      expect.objectContaining({
        credentials: "include",
        body: JSON.stringify({ email: "Ada@Example.com", password: "correct horse" }),
      }),
    );
  });

  test("creates an account and brings the user into the platform", async () => {
    const fetch = backendSays(() => Response.json(ADA, { status: 201 }));
    render(<AuthForm mode="sign-up" />);

    fillIn("ada@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(getSession()).toEqual(ADA);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/signup",
      expect.objectContaining({
        body: JSON.stringify({ email: "ada@example.com", password: "correct horse" }),
      }),
    );
  });

  test("asks for a password of eight characters when creating an account", () => {
    render(<AuthForm mode="sign-up" />);

    expect(password().required).toBe(true);
    expect(password().minLength).toBe(8);
    expect(password().autocomplete).toBe("new-password");
    expect(screen.getByText("At least 8 characters.")).toBeDefined();
  });

  test("takes whatever password the user has when signing in", () => {
    render(<AuthForm mode="sign-in" />);

    expect(password().required).toBe(true);
    expect(password().minLength).toBe(-1);
    expect(password().autocomplete).toBe("current-password");
    expect(screen.queryByText("At least 8 characters.")).toBeNull();
  });

  test.each([
    ["sign-in", "Create an account", "/signup/"],
    ["sign-up", "Sign in", "/login/"],
  ] as const)("offers the other screen from %s", (mode, name, href) => {
    render(<AuthForm mode={mode} />);

    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
  });

  test("shows that it is working while the request is in flight", () => {
    backendSays(() => new Promise(() => {}));
    render(<AuthForm mode="sign-in" />);

    fillIn("ada@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const button = screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  test.each([
    [
      "sign-in",
      "Sign in",
      () => Response.json({ detail: "Incorrect email or password." }, { status: 401 }),
      "Incorrect email or password.",
    ],
    [
      "sign-up",
      "Create account",
      () => Response.json({ detail: "An account with this email already exists." }, { status: 409 }),
      "An account with this email already exists.",
    ],
    [
      "sign-in",
      "Sign in",
      () => Promise.reject(new TypeError("Failed to fetch")),
      "We couldn’t sign you in. Please try again.",
    ],
    [
      "sign-up",
      "Create account",
      () => Response.json({ detail: [{ msg: "Too short" }] }, { status: 422 }),
      "We couldn’t create your account. Please try again.",
    ],
  ] as const)("stays on the %s screen and says why when it fails", async (mode, name, respond, why) => {
    backendSays(respond);
    render(<AuthForm mode={mode} />);

    fillIn("ada@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name }));

    expect((await screen.findByRole("alert")).textContent).toBe(why);
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false);
    expect(getSession()).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("clears the last failure when the user tries again", async () => {
    backendSays(() => Response.json({ detail: "Incorrect email or password." }, { status: 401 }));
    render(<AuthForm mode="sign-in" />);
    fillIn("ada@example.com", "wrong horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("alert");

    backendSays(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("tells a user whose session ended why they are signing in again", async () => {
    setSession(ADA);
    backendSays(() => Response.json({ detail: "Sign in to continue." }, { status: 401 }));
    await listDocuments().catch(() => {});

    render(<AuthForm mode="sign-in" />);

    expect(screen.getByRole("status").textContent).toBe(
      "Your session has ended. Sign in again to continue.",
    );
  });

  test("says nothing of an ended session to someone who signed out", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  test("sends someone who is already signed in straight to the platform", () => {
    setSession(ADA);

    render(<AuthForm mode="sign-in" />);

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/");
  });

  test.each(["sign-in", "sign-up"] as const)(
    "takes only an email address the backend would accept, on %s",
    (mode) => {
      render(<AuthForm mode={mode} />);
      const email = screen.getByLabelText("Email") as HTMLInputElement;
      const valid = (value: string) => {
        fireEvent.change(email, { target: { value } });
        return email.checkValidity();
      };

      expect(["ada@example.com", "a.b+c@mail.example.co"].map(valid)).toEqual([true, true]);
      // The browser alone would let these through, for the backend to refuse.
      expect(["ada@localhost", "ada@example", "ada"].map(valid)).toEqual([false, false, false]);
    },
  );
});
