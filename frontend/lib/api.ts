// The backend serves the built frontend, so the API is on the same origin except under `next dev`.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export type User = {
  id: number;
  email: string;
};

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Sign in failed with status ${response.status}`);
  }
  return response.json();
}
