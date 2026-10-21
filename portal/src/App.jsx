import { useCallback, useEffect, useState } from "react";
import Login from "./components/Login";
import Launcher from "./components/Launcher";
import AppHost from "./components/AppHost";
import { getStoredAuth, handleOAuthCallback, signOut } from "./services/auth";
import { listApps } from "./services/apps";
import { PORTAL_CONFIG } from "./config";

const APP_ROUTE = /^#\/app\/([^/]+\/[^/]+)$/;

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [apps, setApps] = useState(null);
  const [appsError, setAppsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const hash = useHash();

  // Finish the OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    const state = params.get("state");
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setSigningIn(true);
    handleOAuthCallback(code, state)
      .then((result) => {
        setAuthError("");
        setAuth(result);
      })
      .catch((err) => setAuthError(err.message))
      .finally(() => setSigningIn(false));
  }, []);

  // Any 401 or failed refresh anywhere (shell or app) lands here
  useEffect(() => {
    const onSignedOut = () => {
      setAuth(null);
      setApps(null);
      setAuthError("Your session expired. Sign in again.");
    };
    window.addEventListener("portal:signed-out", onSignedOut);
    return () => window.removeEventListener("portal:signed-out", onSignedOut);
  }, []);

  const loadApps = useCallback(() => {
    setApps(null);
    setAppsError("");
    listApps()
      .then(setApps)
      .catch((err) => setAppsError(err.message));
  }, []);

  useEffect(() => {
    if (auth) loadApps();
  }, [auth, loadApps]);

  const goHome = useCallback(() => {
    window.location.hash = "";
  }, []);

  const openApp = (app) => {
    window.location.hash = `#/app/${app.fullName}`;
  };

  const handleSignOut = () => {
    signOut();
    setAuth(null);
    setApps(null);
    setAuthError("");
    goHome();
  };

  if (!auth) {
    return <Login error={authError} signingIn={signingIn} />;
  }

  const requested = hash.match(APP_ROUTE)?.[1] ?? null;
  const current = requested && apps ? apps.find((a) => a.fullName === requested) : null;
  const missing = requested && apps && !current ? requested : null;

  return (
    <div className="shell">
      <header className="topbar">
        <nav className="crumbs" aria-label="Location">
          <button className="crumb-home" onClick={goHome}>
            {PORTAL_CONFIG.title}
          </button>
          {current && (
            <>
              <span className="crumb-sep" aria-hidden="true">/</span>
              <span className="crumb-current">{current.name}</span>
            </>
          )}
        </nav>

        <div className="topbar-actions">
          {current && (
            <>
              <button className="btn btn-quiet" onClick={() => setReloadKey((k) => k + 1)}>
                Reload app
              </button>
              <a className="btn btn-quiet" href={current.htmlUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </>
          )}
          <span className="user">
            {auth.avatar && <img src={auth.avatar} alt="" width="24" height="24" />}
            {auth.username}
          </span>
          <button className="btn btn-quiet" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {current ? (
        <AppHost app={current} user={auth} reloadKey={reloadKey} onExit={goHome} />
      ) : requested && !apps && !appsError ? (
        <p className="app-status muted">Opening {requested}…</p>
      ) : (
        <Launcher apps={apps} error={appsError} missing={missing} onOpen={openApp} onRetry={loadApps} />
      )}
    </div>
  );
}
