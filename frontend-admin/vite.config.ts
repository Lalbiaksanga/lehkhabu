import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load .env from monorepo root (one directory up)
  envDir: path.resolve(__dirname, '..'),
  server: {
    port: 5174,
  },
});
