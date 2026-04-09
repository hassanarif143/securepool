import { setAuthTokenGetter } from "@workspace/api-client-react";

function registerGetter() {
  // Cookie-only auth: never expose or persist JWT in JS storage.
  setAuthTokenGetter(() => null);
}

export function initAuthTokenFromStorage(): void {
  registerGetter();
}

export function setSessionAccessToken(_token: string | null): void {
  // Intentionally no-op in cookie-only mode.
  registerGetter();
}
