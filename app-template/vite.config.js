import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds a single ES module (dist/app.js) plus dist/app.css for the portal to load.
// Everything has to live in those two files: the portal imports app.js from a
// blob URL, so relative imports and separate asset files won't resolve.
export default defineConfig({
  plugins: [react()],
  // Library mode doesn't replace this on its own, and React needs it
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: {
      entry: "src/portal-entry.jsx",
      formats: ["es"],
      fileName: () => "app.js",
    },
    assetsInlineLimit: 100_000_000, // inline images/fonts as data URLs
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "app.[ext]",
      },
    },
  },
});
