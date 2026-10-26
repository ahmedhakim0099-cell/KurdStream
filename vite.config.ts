import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'hls.js'],
  },
  server: {
    proxy: {
      '/api/subtitles': {
        target: 'https://umqqbyfgspvxpkfobzmz.supabase.co/functions/v1/subtitle-file',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/subtitles/, ''),
      },
    },
  },
});
