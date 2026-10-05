import { afterEach, describe, expect, test, vi } from "vitest";
import { login } from "@/lib/api";

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
