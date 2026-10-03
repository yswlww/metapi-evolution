import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Real Metapi backend dev server (see repo root package.json: npm run dev:server)
const BACKEND_TARGET = process.env.METAPI_BACKEND_URL || "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy API calls to the real backend during development.
      // Set METAPI_BACKEND_URL to override the target.
      "/api": {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
      // Proxy the downstream OpenAI/Claude-compatible surface too.
      "/v1": {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
});
