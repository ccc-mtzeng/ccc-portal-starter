function monogram(name) {
  const words = name.replace(/[-_]/g, " ").trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

function hueFor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export default function Launcher({ apps, error, missing, onOpen, onRetry }) {
  if (error) {
    return (
      <section className="launcher">
        <p className="notice notice-error" role="alert">
          Couldn't load your apps: {error}
        </p>
        <button className="btn" onClick={onRetry}>Try again</button>
      </section>
    );
  }

  if (!apps) {
    return (
      <section className="launcher" aria-busy="true">
        <p className="muted">Finding apps shared with you…</p>
      </section>
    );
  }

  return (
    <section className="launcher">
      <header className="launcher-head">
        <h1>Apps</h1>
        <p className="muted">
          {apps.length === 0 ? "None shared with you yet" : `${apps.length} shared with you`}
        </p>
      </header>

      {missing && (
        <p className="notice" role="status">
          {missing} isn't available to your account. It may not be published yet, or you may need to be
          added to it.
        </p>
      )}

      {apps.length === 0 ? (
        <p className="empty">
          When the portal admin gives your GitHub account access to an app, it shows up here. Sign out and back in
          if you were just added.
        </p>
      ) : (
        <ul className="app-list">
          {apps.map((app) => (
            <li key={app.fullName}>
              <button className="app-row" onClick={() => onOpen(app)}>
                <span className="monogram" style={{ "--hue": hueFor(app.fullName) }} aria-hidden="true">
                  {monogram(app.name)}
                </span>
                <span className="app-text">
                  <span className="app-name">{app.name}</span>
                  {app.description && <span className="app-desc">{app.description}</span>}
                </span>
                <span className="app-repo">{app.fullName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
