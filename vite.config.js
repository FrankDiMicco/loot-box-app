import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs so the build works at the GitHub Pages project
  // subpath (/loot-box-app/) without hardcoding it.
  base: './',
  plugins: [react()],
});
