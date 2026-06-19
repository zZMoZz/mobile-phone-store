import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the API runs on Express (port 4000); proxy /api, /uploads, /assets to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/assets': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/form', '@mantine/notifications'],
          charts: ['@mantine/charts', 'recharts'],
        },
      },
    },
  },
});
