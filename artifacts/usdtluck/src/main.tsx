import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getApiBaseUrl } from "./lib/api-base";
import { initAuthTokenFromStorage } from "./lib/auth-token";
import { getCsrfToken, setCsrfToken } from "./lib/csrf";

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) return null;
  return parts.pop()!.split(";").shift() ?? null;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? (typeof input === "string" ? "GET" : (input as Request).method ?? "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return nativeFetch(input, init);
  }

  const csrf = getCsrfToken() ?? getCookie("sp_csrf");
  if (!csrf) return nativeFetch(input, init);

  const headers = new Headers(init?.headers ?? {});
  headers.set("x-csrf-token", csrf);

  return nativeFetch(input, {
    ...init,
    headers,
  });
};

async function bootstrapCsrf(): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) return;
  try {
    const res = await fetch(`${base}/api/auth/csrf-token`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { csrfToken?: string };
    if (typeof data.csrfToken === "string") setCsrfToken(data.csrfToken);
  } catch {
    // Non-fatal: login/signup still fetch CSRF before POST
  }
}

const apiBase = getApiBaseUrl();
if (apiBase) {
  setBaseUrl(apiBase);
}
initAuthTokenFromStorage();

void bootstrapCsrf().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
