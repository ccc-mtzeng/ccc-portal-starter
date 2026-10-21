// Local development only. Not part of the build.
import { mount } from "./portal-entry";

const token = import.meta.env.VITE_DEV_TOKEN;
const fullName = import.meta.env.VITE_DEV_REPO || "your-org/this-repo";

const ctx = {
  user: { login: "dev", avatar: "" },
  app: { fullName, name: "Example app (dev)", version: "dev" },
  getToken: async () => token,
  github: (path, { raw = false, headers, ...init } = {}) =>
    fetch(path.startsWith("http") ? path : `https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...headers,
      },
    }),
  goHome: () => alert("goHome() would return to the portal"),
};

mount(document.getElementById("root"), ctx);
