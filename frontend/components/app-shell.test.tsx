import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { clearSession, setSession } from "@/lib/session";

const navigation = vi.hoisted(() => ({ pathname: "/", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

beforeEach(() => {
  navigation.pathname = "/";
  setSession({ id: 1, email: "ada@example.com" });
});

afterEach(() => {
  cleanup();
  navigation.replace.mockReset();
});

function renderShell() {
  render(
    <AppShell>
      <p>The page</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  test("frames the page with the product's name, who is signed in and a way out", () => {
    renderShell();

    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Prelegal")).toBeDefined();
    expect(header.getByText("ada@example.com")).toBeDefined();
    expect(header.getByRole("button", { name: "Sign out" })).toBeDefined();
    expect(screen.getByText("The page")).toBeDefined();
    expect(screen.getByRole("contentinfo").textContent).toContain("does not give legal advice");
  });

  test.each([
    ["/", "New document"],
    ["/documents", "My documents"],
    ["/documents/", "My documents"],
  ])("marks where the user is when at %s", (pathname, current) => {
    navigation.pathname = pathname;

    renderShell();

    const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/documents/"]);
    expect(
      links.filter((link) => link.getAttribute("aria-current") === "page").map((link) =>
        link.getAttribute("aria-label"),
      ),
    ).toEqual([current]);
  });

  test("shows none of it to a visitor who is not signed in", () => {
    clearSession();

    renderShell();

    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByText("The page")).toBeNull();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
});
