# Portal starter

A public GitHub Pages shell that signs users in with GitHub and loads apps
from private repos at runtime, using each user's own token. If GitHub won't
let a user read an app's repo, the portal can't load that app for them. Repo
permissions are the access control.

```
portal/          → public repo, deployed to GitHub Pages
  worker/        → Cloudflare Worker (token exchange + refresh)
app-template/    → copy this for each private app repo
```

## How it fits together

1. The user signs in through a **GitHub App**. The Worker swaps the OAuth code
   for a user token. The token expires after 8 hours and the portal refreshes it
   through the Worker.
2. The portal lists every repo the user can reach through the GitHub App, and
   treats any repo with a `manifest.json` on its `portal-dist` branch as an app.
3. Opening an app fetches `app.js` (and `app.css`) from that branch with the
   user's token, imports it from a blob URL, and calls `mount(el, ctx)` inside a
   shadow root.

There's no app registry to maintain. Publishing an app means pushing to its
repo, and sharing an app means giving someone read access to that repo.

## One-time setup

### 1. Create a GitHub organization (free plan is fine)

Put the app repos in an org rather than your personal account. On a personal
account, every collaborator on a private repo gets **write** access. Orgs let
you grant read-only access through teams, and teams become your access groups,
e.g. `app-solution-tracker` or `finance-tools`.

In org settings, set **Base permissions** to **No permission** so members only
see what their teams grant.

### 2. Create a GitHub App owned by the org

Org settings → Developer settings → GitHub Apps → New GitHub App:

| Setting | Value |
| --- | --- |
| Callback URLs | your Pages URL (e.g. `https://your-org.github.io/`) **and** `http://localhost:5173/` |
| Expire user authorization tokens | On |
| Request user authorization during installation | Off |
| Webhook | Uncheck **Active** |
| Repository permissions → Contents | **Read-only**, or **Read and write** if apps save data to repos |
| Repository permissions → Metadata | Read-only (required) |
| Where can this app be installed | Only on this account |

Then copy the **Client ID** and generate a **client secret**. Install the app
on the org with **All repositories** so new app repos are picked up
automatically. A user's token reaches a repo only if the app is installed on it
*and* that user personally has access, so "All repositories" doesn't widen
anyone's access.

### 3. Deploy the Worker

```bash
cd portal/worker
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put ALLOWED_ORIGINS    # https://your-org.github.io,http://localhost:5173
wrangler secret put ALLOWED_USERS      # optional; leave empty to rely on repo access alone
wrangler deploy
```

### 4. Configure and deploy the portal

1. Create a **public** repo for `portal/`. Name it `your-org.github.io` to serve
   it at the root, or set `base` in `vite.config.js` to `/<repo-name>/` and
   update the callback URL to match.
2. Fill in `clientId` and `workerUrl` in `src/config.js`.
3. Settings → Pages → Source: **GitHub Actions**, then push to `main`.

The portal repo contains no app code and no secrets.

## Adding an app

1. Create a **private** repo in the org from `app-template/`.
2. Edit `portal.json` (name, description) and build your app in `src/`.
3. Push to `main`. The `Publish to portal` workflow builds it and force-pushes
   the bundle to the `portal-dist` branch.
4. Give a team read access to the repo. Its members see the app the next time
   they open the portal.

Local dev: copy `.env.example` to `.env.local`, add a fine-grained PAT, and
run `npm run dev`. `src/dev.jsx` mounts the app with a stand-in `ctx`.

### The app contract

```js
export function mount(el, ctx) {
  // render into el
  return () => { /* cleanup */ };
}
```

| `ctx` | |
| --- | --- |
| `user` | `{ login, avatar }` |
| `app` | `{ fullName, name, version }` |
| `getToken()` | Promise of a fresh token. Call it per request; tokens rotate every 8 hours. |
| `github(path, init)` | Authenticated `fetch` to `api.github.com`. Pass `{ raw: true }` for file contents as text. |
| `goHome()` | Back to the app list |

Build output must be a single `app.js` (plus optional `app.css`): the
template's Vite config inlines dynamic imports and assets for that reason.

By default the app renders in a shadow root, so its CSS stays contained. The
portal's `--portal-*` CSS variables pass through, so apps can match the
portal's colors and follow light/dark mode. If an app uses a library that
renders popups into `document.body`, set `"isolation": "none"` in `portal.json`.

## Managing access

| To | Do |
| --- | --- |
| Give someone an app | Add them to the org, then to a team with read access to that app's repo |
| Revoke an app | Remove them from the team. GitHub checks permissions on every request, so it's immediate |
| Revoke everything | Remove them from the org. Also immediate |
| Block someone from signing in at all | Add an `ALLOWED_USERS` list to the Worker. Re-checked on each token refresh (at most 8 hours) |

## Security notes

- The GitHub App client secret lives only in the Worker.
- Tokens are stored in `localStorage` and every app runs on the portal's
  origin, so any app can read the signed-in user's token. That's fine while
  you write all the apps. Don't load third-party code into the portal.
- People who can open an app can read its code. Keep API keys and secrets out
  of app bundles and behind a Worker endpoint.
- Actions logs in the **public** portal repo are public. App repos are private,
  so their build logs are too.
