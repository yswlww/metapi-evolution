/**
 * Authenticated API client for the Metapi Evolution backend.
 * Attaches Bearer token from localStorage; clears session on 401/403.
 */

const AUTH_KEY = "metapi-auth-token";

export function getStoredToken(): string | null {
  try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
}

export function clearStoredToken(): void {
  try { localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
}

function extractError(res: Response): Promise<string> {
  return res.text().then((text) => {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed?.message === "string"
        ? parsed.message
        : typeof parsed?.error === "string"
          ? parsed.error
          : text;
    } catch {
      return text || `Request failed (${res.status})`;
    }
  });
}

async function authFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const token = getStoredToken();
  const headers = new Headers(fetchOptions.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (fetchOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal, headers });
    if (res.status === 401 || res.status === 403) {
      clearStoredToken();
      if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
        window.location.reload();
      }
      throw new Error("Session expired — please sign in again.");
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type ApiRequestOptions = RequestInit & { timeoutMs?: number };

export async function apiGet<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const res = await authFetch(url, { ...options, method: "GET" });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const res = await authFetch(url, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json() as Promise<T>;
}

export async function apiPut<T = unknown>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const res = await authFetch(url, {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json() as Promise<T>;
}

export async function apiPatch<T = unknown>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const res = await authFetch(url, {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json() as Promise<T>;
}

export async function apiDelete<T = unknown>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const res = await authFetch(url, {
    ...options,
    method: "DELETE",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json() as Promise<T>;
}
