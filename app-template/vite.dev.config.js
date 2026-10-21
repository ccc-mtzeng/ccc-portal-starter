import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone dev server: index.html -> src/dev.jsx mounts the app with a stand-in ctx.
export default defineConfig({ plugins: [react()] });
