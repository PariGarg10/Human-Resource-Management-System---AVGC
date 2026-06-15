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
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  base: mode === 'production' ? '/assets/avgc-dashboard/' : '/',
  build: {
    outDir: path.resolve(__dirname, '../../public/assets/avgc-dashboard'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'index.html'),
        teamHub: path.resolve(__dirname, 'src/team-hub-entry.tsx'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'teamHub' ? 'team-hub.js' : 'employee-app.js'),
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          const n = assetInfo.names?.[0] ?? '';
          if (typeof n === 'string' && n.endsWith('.css')) {
            if (n.includes('team-hub') || n.includes('teamHub')) return 'team-hub.css';
            return 'employee-app.css';
          }
          return 'assets/[name][extname]';
        },
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || /[/\\]react[/\\]/.test(id) || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date';
            }
            if (id.includes('canvas-confetti')) {
              return 'vendor-confetti';
            }
            return undefined;
          }
          if (
            id.includes('/lib/api') ||
            id.includes('/lib/toast') ||
            id.includes('/lib/userProfileStorage') ||
            id.includes('/lib/formatDate')
          ) {
            return 'shared-core';
          }
          return undefined;
        },
      },
    },
  },
}));
