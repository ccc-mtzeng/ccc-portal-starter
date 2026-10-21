/**
 * Portal auth Worker
 *
 *   POST /auth/token    { code }           -> exchange OAuth code for a GitHub App user token
 *   POST /auth/refresh  { refresh_token }  -> refresh an expiring token
 *
 * The only secret in the whole system (the GitHub App client secret) lives here.
 * Access to individual apps is enforced by GitHub repo permissions, not by this
 * Worker. ALLOWED_USERS is an optional outer gate for the portal as a whole,
 * re-checked on every refresh so removals take effect within one token lifetime.
 */

export default {
  async fetch(request, env) {
    const allowedOrigins = list(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    const { pathname } = new URL(request.url);
    try {
      if (request.method === "POST" && pathname === "/auth/token") {
        const { code } = await request.json();
        if (!code) return json({ error: "Missing code" }, 400, cors);
        const token = await exchange(env, { code });
        return json(await withVerifiedUser(env, token), 200, cors);
      }

      if (request.method === "POST" && pathname === "/auth/refresh") {
        const { refresh_token } = await request.json();
        if (!refresh_token) return json({ error: "Missing refresh_token" }, 400, cors);
        const token = await exchange(env, { grant_type: "refresh_token", refresh_token });
        return json(await withVerifiedUser(env, token), 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return json({ error: status === 500 ? "Internal error" : err.message }, status, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function exchange(env, params) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json();
  if (data.error) throw new HttpError(400, data.error_description || data.error);
  return data;
}

async function withVerifiedUser(env, token) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "portal-auth-worker",
    },
  });
  if (!res.ok) throw new HttpError(502, "Couldn't verify your GitHub identity");
  const user = await res.json();

  const allowed = list(env.ALLOWED_USERS).map((u) => u.toLowerCase());
  if (allowed.length && !allowed.includes(user.login.toLowerCase())) {
    throw new HttpError(403, `${user.login} isn't authorized to use this portal.`);
  }

  return {
    access_token: token.access_token,
    expires_in: token.expires_in ?? null,
    refresh_token: token.refresh_token ?? null,
    refresh_token_expires_in: token.refresh_token_expires_in ?? null,
    username: user.login,
    avatar: user.avatar_url,
  };
}

function list(value) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data, status, headers) {
  return Response.json(data, { status, headers });
}
