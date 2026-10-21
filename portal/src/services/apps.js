/**
 * App discovery and loading.
 *
 * Discovery: list every repo the signed-in user can reach through the
 * GitHub App, and treat any repo whose `portal-dist` branch has a
 * manifest.json as an app. No registry to maintain: giving someone access
 * to an app means giving them read access to its repo.
 *
 * Loading: fetch the built bundle from that branch with the user's token,
 * turn it into a blob URL, and import() it. The module must export
 * `mount(el, ctx)`, which may return a cleanup function.
 */

import { PORTAL_CONFIG } from "../config";
import { getValidToken, expireSession, AuthExpiredError } from "./auth";

const API = "https://api.github.com";

/** Authenticated fetch against the GitHub REST API. Also handed to apps as ctx.github. */
export async function gh(path, { raw = false, headers, ...init } = {}) {
  const token = await getValidToken();
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...headers,
    },
  });
  if (res.status === 401) {
    expireSession();
    throw new AuthExpiredError();
  }
  return res;
}

function nextPage(linkHeader) {
  const match = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function paginate(path, key) {
  const items = [];
  let url = path;
  while (url) {
    const res = await gh(url);
    if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${path}.`);
    const body = await res.json();
    items.push(...body[key]);
    url = nextPage(res.headers.get("link"));
  }
  return items;
}

function contentsPath(fullName, file) {
  const ref = encodeURIComponent(PORTAL_CONFIG.distBranch);
  return `/repos/${fullName}/contents/${encodeURI(file)}?ref=${ref}`;
}

async function readManifest(repo) {
  const res = await gh(contentsPath(repo.full_name, "manifest.json"), { raw: true });
  if (res.status === 404) return null; // not an app (e.g. a data repo)
  if (!res.ok) {
    console.warn(`Skipping ${repo.full_name}: manifest returned ${res.status}`);
    return null;
  }
  let manifest;
  try {
    manifest = JSON.parse(await res.text());
  } catch {
    console.warn(`Skipping ${repo.full_name}: manifest.json isn't valid JSON`);
    return null;
  }
  return {
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    name: manifest.name || repo.name,
    description: manifest.description || repo.description || "",
    entry: manifest.entry || "app.js",
    styles: manifest.styles || null,
    isolation: manifest.isolation === "none" ? "none" : "shadow",
    version: manifest.version || null,
    builtAt: manifest.built_at || null,
  };
}

export async function listApps() {
  // Installations of *this* GitHub App that the user can see
  const installations = await paginate("/user/installations?per_page=100", "installations");
  const repoLists = await Promise.all(
    installations.map((i) =>
      paginate(`/user/installations/${i.id}/repositories?per_page=100`, "repositories")
    )
  );
  const repos = [...new Map(repoLists.flat().map((r) => [r.full_name, r])).values()];
  const apps = await Promise.all(repos.map(readManifest));
  return apps.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchFile(app, file) {
  const res = await gh(contentsPath(app.fullName, file), { raw: true });
  if (!res.ok) {
    throw new Error(`Couldn't load ${file} from ${app.fullName}. GitHub returned ${res.status}.`);
  }
  return res.text();
}

export async function importApp(app) {
  const [code, css] = await Promise.all([
    fetchFile(app, app.entry),
    app.styles ? fetchFile(app, app.styles) : null,
  ]);
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    const mount = mod.mount ?? mod.default?.mount;
    if (typeof mount !== "function") {
      throw new Error(`${app.entry} in ${app.fullName} doesn't export mount(el, ctx).`);
    }
    return { mount, css };
  } finally {
    URL.revokeObjectURL(url);
  }
}
