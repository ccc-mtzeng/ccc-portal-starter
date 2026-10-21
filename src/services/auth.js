/**
 * Sign-in with a GitHub App (user-to-server tokens).
 *
 * Flow:
 *   1. redirectToGitHub() sends the user to GitHub with a random `state`
 *   2. GitHub redirects back with ?code=…&state=…
 *   3. handleOAuthCallback() checks `state`, then asks the Worker to
 *      exchange the code (the client secret never reaches the browser)
 *   4. getValidToken() hands out the token and refreshes it through the
 *      Worker shortly before it expires (GitHub App tokens last 8 hours)
 *
 * The token can only reach repos where the GitHub App is installed AND
 * the user personally has access. That intersection is the real access
 * control; nothing in this file is a security boundary.
 */

import { PORTAL_CONFIG } from "../config";

const STORAGE_KEY = "portal_auth";
const STATE_KEY = "portal_oauth_state";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class AuthExpiredError extends Error {
  constructor(message = "Your session expired. Sign in again.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

export function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function signOut() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Clear the session and tell the shell, so it can return to the login screen. */
export function expireSession() {
  signOut();
  window.dispatchEvent(new Event("portal:signed-out"));
}

export function redirectToGitHub() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: PORTAL_CONFIG.clientId,
    redirect_uri: PORTAL_CONFIG.redirectUri,
    state,
  });
  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

async function callWorker(path, body) {
  const res = await fetch(`${PORTAL_CONFIG.workerUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `The sign-in service returned ${res.status}.`);
  }
  return data;
}

function toAuth(data, previous = {}) {
  return {
    token: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // null when token expiration is turned off in the GitHub App settings
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    username: data.username ?? previous.username,
    avatar: data.avatar ?? previous.avatar,
  };
}

export async function handleOAuthCallback(code, state) {
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!expected || expected !== state) {
    throw new Error("This sign-in link expired or was started in another tab. Sign in again.");
  }
  const auth = toAuth(await callWorker("/auth/token", { code }));
  storeAuth(auth);
  return auth;
}

let refreshing = null;

/**
 * Returns a usable access token, refreshing it first if it's close to expiry.
 * Apps should call this right before each request rather than caching the token.
 */
export async function getValidToken() {
  const auth = getStoredAuth();
  if (!auth?.token) {
    expireSession();
    throw new AuthExpiredError();
  }
  if (!auth.expiresAt || auth.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return auth.token;
  }
  if (!auth.refreshToken) {
    expireSession();
    throw new AuthExpiredError();
  }

  // Single-flight: concurrent callers share one refresh request
  refreshing ??= callWorker("/auth/refresh", { refresh_token: auth.refreshToken })
    .then((data) => {
      const next = toAuth(data, auth);
      storeAuth(next);
      return next.token;
    })
    .catch(() => {
      expireSession();
      throw new AuthExpiredError();
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}
