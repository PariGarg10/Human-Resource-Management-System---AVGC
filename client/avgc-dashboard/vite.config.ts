import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: mode === 'production' ? '/assets/avgc-dashboard/' : '/',
  build: {
    outDir: path.resolve(__dirname, '../../public/assets/avgc-dashboard'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'employee-app.js',
        chunkFileNames: 'employee-[name].js',
        assetFileNames: (assetInfo) => {
          const n = assetInfo.names?.[0] ?? '';
          if (typeof n === 'string' && n.endsWith('.css')) return 'employee-app.css';
          return 'employee-[name][extname]';
        },
      },
    },
  },
}));
