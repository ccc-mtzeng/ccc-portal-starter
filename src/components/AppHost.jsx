import { useEffect, useRef, useState } from "react";
import { importApp, gh } from "../services/apps";
import { getValidToken } from "../services/auth";

/**
 * Loads an app bundle and mounts it. By default the app renders inside a
 * shadow root so its CSS can't leak into the shell (or vice versa). Apps
 * that need document-level DOM (some modal/tooltip libraries portal into
 * document.body) can set "isolation": "none" in their manifest.
 */
export default function AppHost({ app, user, reloadKey, onExit }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    let cancelled = false;
    let cleanup = null;
    let styleEl = null;

    setStatus("loading");
    setError("");

    // A fresh element per load, since a node can only get one shadow root
    const mountPoint = document.createElement("div");
    mountPoint.className = "app-mount";
    host.replaceChildren(mountPoint);

    (async () => {
      try {
        const { mount, css } = await importApp(app);
        if (cancelled) return;

        const isolated = app.isolation !== "none";
        const root = isolated ? mountPoint.attachShadow({ mode: "open" }) : mountPoint;

        if (css) {
          styleEl = document.createElement("style");
          styleEl.dataset.portalApp = app.fullName;
          styleEl.textContent = css;
          (isolated ? root : document.head).appendChild(styleEl);
        }

        const target = document.createElement("div");
        target.className = "app-root";
        root.appendChild(target);

        const ctx = {
          user: { login: user.username, avatar: user.avatar },
          app: { fullName: app.fullName, name: app.name, version: app.version },
          getToken: getValidToken,
          github: gh,
          goHome: onExit,
        };

        const result = await mount(target, ctx);
        if (cancelled) {
          if (typeof result === "function") result();
          return;
        }
        cleanup = typeof result === "function" ? result : null;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        cleanup?.();
      } catch (err) {
        console.error(`Error while closing ${app.fullName}:`, err);
      }
      styleEl?.remove();
      host.replaceChildren();
    };
  }, [app, user, reloadKey, onExit]);

  return (
    <div className="app-host">
      {status === "loading" && <p className="app-status muted">Loading {app.name}…</p>}
      {status === "error" && (
        <div className="app-status">
          <p className="notice notice-error" role="alert">
            {app.name} couldn't start. {error}
          </p>
          <button className="btn" onClick={onExit}>Back to apps</button>
        </div>
      )}
      <div ref={hostRef} className="app-frame" hidden={status === "error"} />
    </div>
  );
}
