/**
 * The portal contract: export mount(el, ctx), optionally return a cleanup function.
 *
 * ctx.user       { login, avatar }
 * ctx.app        { fullName, name, version }
 * ctx.getToken() resolves to a fresh GitHub token; call it per request, don't cache it
 * ctx.github(path, init)  authenticated fetch against api.github.com
 *                         (pass { raw: true } to get file contents as text)
 * ctx.goHome()   return to the portal's app list
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app.css";

export function mount(el, ctx) {
  const root = createRoot(el);
  root.render(<App ctx={ctx} />);
  return () => root.unmount();
}
