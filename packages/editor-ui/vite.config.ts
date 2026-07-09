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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "xyflow": ["@xyflow/react"],
          "codemirror": [
            "@uiw/react-codemirror",
            "@uiw/codemirror-theme-vscode",
            "@codemirror/lang-json",
            "@codemirror/lang-javascript",
          ],
        },
      },
    },
  },
});
