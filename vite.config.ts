import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/client",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "src/client/index.html"),
        app: resolve(import.meta.dirname, "src/client/app.html"),
      },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
