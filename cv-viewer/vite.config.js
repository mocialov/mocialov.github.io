import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Deploy to https://mocialov.github.io/cv/
  base: '/cv/',
  build: {
    outDir: 'dist',
  },
});
