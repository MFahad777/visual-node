import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-preview',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: 'preview.html',
      output: {
        manualChunks: {
          'xyflow': ['@xyflow/react'],
        },
      },
    },
  },
});
