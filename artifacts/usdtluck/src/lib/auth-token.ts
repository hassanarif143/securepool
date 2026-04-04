import { setAuthTokenGetter } from "@workspace/api-client-react";

const STORAGE_KEY = "sp_access_token";

let memoryToken: string | null = null;

function registerGetter() {
  setAuthTokenGetter(() => memoryToken);
}

/** Call once at startup (before React) so useGetMe sends Bearer on cross-site API. */
export function initAuthTokenFromStorage(): void {
  try {
    memoryToken = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    memoryToken = null;
  }
  registerGetter();
}

export function setSessionAccessToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / storage disabled */
  }
  registerGetter();
}
