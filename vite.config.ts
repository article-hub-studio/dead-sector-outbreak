import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/dead-sector-outbreak/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
