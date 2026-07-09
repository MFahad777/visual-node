import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // CodeMirror is deliberately NOT manually chunked: every import of it now goes
        // through a lazy()-wrapped component, and forcing it into a named manual chunk
        // pulls Rollup's shared dynamic-import-preload helper into that same chunk,
        // which makes Vite treat it as a static dependency of the entry and eagerly
        // <link rel="modulepreload"> it in index.html — defeating the lazy-load
        // entirely. Leaving it out lets Rollup auto-split it as a purely dynamic chunk.
        manualChunks: {
          "xyflow": ["@xyflow/react"],
        },
      },
    },
  },
});
