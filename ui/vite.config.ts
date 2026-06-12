import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api → Person B's data API so the browser avoids CORS.
// Set VITE_API_BASE in .env (defaults to the proxy target below).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE || "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
