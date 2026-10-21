/**
 * Portal configuration. Everything here is public and safe to commit.
 */
export const PORTAL_CONFIG = {
  title: "Workbench",

  // GitHub App client ID (starts with "Iv"). Not the numeric App ID.
  clientId: "Iv23liXXXXXXXXXXXXXX",

  // Cloudflare Worker that exchanges and refreshes tokens
  workerUrl: "https://portal-auth.your-subdomain.workers.dev",

  // Must exactly match one of the GitHub App's callback URLs.
  // Register both your Pages URL and http://localhost:5173/ so dev works too.
  redirectUri: window.location.origin + import.meta.env.BASE_URL,

  // Branch in each app repo that holds the built bundle + manifest.json
  distBranch: "portal-dist",
};
