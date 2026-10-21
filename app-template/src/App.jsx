import { useEffect, useState } from "react";

export default function App({ ctx }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    ctx
      .github(`/repos/${ctx.app.fullName}/contents/`)
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
        return res.json();
      })
      .then(setFiles)
      .catch((err) => setError(err.message));
  }, [ctx]);

  return (
    <div className="example">
      <h1>Hello, {ctx.user.login}</h1>
      <p className="lede">
        This app was loaded from <strong>{ctx.app.fullName}</strong>, a private repo, using your own GitHub token.
      </p>

      {error && <p className="error">Couldn't list the repo: {error}</p>}
      {!files && !error && <p className="lede">Reading the repo…</p>}
      {files && (
        <ul>
          {files.map((f) => (
            <li key={f.path}>
              {f.name}
              {f.type === "dir" ? "/" : ""}
            </li>
          ))}
        </ul>
      )}

      <button onClick={ctx.goHome}>Back to apps</button>
    </div>
  );
}
