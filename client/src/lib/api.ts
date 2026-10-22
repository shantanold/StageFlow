// In dev: Vite proxies /api → localhost:3001 (no env var needed)
// In prod: set VITE_API_BASE_URL=https://your-api.railway.app/api/v1
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? localStorage.getItem("sf_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed" }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown)   => request<T>(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)   => request<T>(path, { method: "PUT",    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)   => request<T>(path, { method: "PATCH",  body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: "DELETE" }),
};

/**
 * Same calls, sent with an explicit token instead of the signed-in one. Platform
 * admins use it with a short-lived org-scoped token to change one org's data
 * (e.g. an item from All Furniture) without switching the whole app into that org.
 */
export function apiWithToken(token: string) {
  return {
    get:   <T>(path: string)                => request<T>(path, {}, token),
    post:  <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
    put:   <T>(path: string, body: unknown) => request<T>(path, { method: "PUT",  body: JSON.stringify(body) }, token),
  };
}

export { ApiError };
