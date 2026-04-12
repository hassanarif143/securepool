import { readApiErrorMessage } from "./api-base";

/** Parse API error body once, then map to friendly copy (use after `!res.ok`). */
export async function friendlyErrorFromResponse(res: Response): Promise<string> {
  const raw = await readApiErrorMessage(res);
  return friendlyApiError(res.status, raw);
}

/** Use in catch blocks when fetch fails (offline, DNS, CORS). */
export function friendlyNetworkError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  const low = m.toLowerCase();
  if (low.includes("network") || low.includes("failed to fetch") || low.includes("load failed")) {
    return "No internet connection. Check your wifi.";
  }
  return "Something went wrong. Please try again.";
}

/** Map API status + server message to short, non-technical copy for toasts and inline errors. */
export function friendlyApiError(status: number, rawMessage: string): string {
  const m = (rawMessage || "").trim();
  const low = m.toLowerCase();

  if (status === 401) {
    if (low.includes("password") || low.includes("credential") || low.includes("invalid")) {
      return "Wrong email or password.";
    }
    return "Please log in to continue.";
  }
  if (status === 403) {
    if (low.includes("suspended")) {
      return m.length > 0 && m.length < 220 ? m : "This account is suspended.";
    }
    if (low.includes("demo")) {
      return m.length > 0 && m.length < 220 ? m : "Demo accounts cannot sign in.";
    }
    return "You don't have permission for this.";
  }
  if (status === 404) return "We couldn't find that. It may have been removed.";
  if (status === 409 || low.includes("already") || low.includes("duplicate")) {
    if (low.includes("email") || low.includes("account with this email")) return "This email is already registered.";
    if (low.includes("wallet") || low.includes("address is already registered")) {
      return "This wallet address is already on another account.";
    }
    return "That action isn't available right now.";
  }
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (status >= 500) return "Something went wrong. Please try again.";

  if (status === 400) {
    if (low.includes("password") && low.includes("6")) return "Password must be at least 6 characters.";
    if (low.includes("match") || low.includes("confirm")) return "Passwords don't match.";
    if (low.includes("email")) return "Enter a valid email address.";
  }

  if (m.length > 0 && m.length < 180 && !m.startsWith("{")) return m;
  return "Something went wrong. Please try again.";
}
