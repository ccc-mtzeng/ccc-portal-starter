import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If the portal repo is named <owner>.github.io, keep base at "/".
// Otherwise set it to "/<repo-name>/".
export default defineConfig({
  plugins: [react()],
  base: "/",
});
