import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Deploy to https://mocialov.github.io/
  base: '/',
  build: {
    outDir: 'dist',
  },
});
