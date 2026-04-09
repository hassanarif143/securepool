import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getApiBaseUrl } from "./lib/api-base";
import { getCsrfToken, setCsrfToken } from "./lib/csrf";

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) return null;
  return parts.pop()!.split(";").shift() ?? null;
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Cross-origin default is `same-origin` — cookies are dropped. Force include for our API host (and dev `/api` proxy). */
function withApiCredentials(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const url = resolveRequestUrl(input);
  const targetsApi =
    (base && url.startsWith(base)) ||
    (!base && (url.startsWith("/api") || url.startsWith(`${window.location.origin}/api`)));
  if (!targetsApi) return init;
  if (init?.credentials != null && init.credentials !== "include") return init;
  return { ...init, credentials: "include" };
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const mergedInit = withApiCredentials(input, init);
  const method = (
    mergedInit?.method ??
    (typeof input === "string" ? "GET" : (input as Request).method ?? "GET")
  ).toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return nativeFetch(input, mergedInit);
  }

  const csrf = getCsrfToken() ?? getCookie("sp_csrf");
  if (!csrf) return nativeFetch(input, mergedInit);

  const headers = new Headers(mergedInit?.headers ?? {});
  headers.set("x-csrf-token", csrf);

  return nativeFetch(input, {
    ...mergedInit,
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

void bootstrapCsrf().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
