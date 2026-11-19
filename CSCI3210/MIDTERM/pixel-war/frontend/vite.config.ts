import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  const backend = env.VITE_BACKEND_URL?.trim();
  if (command === 'build' && backend) {
    const url = new URL(backend);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash ||
        url.username || url.password) {
      throw new Error('VITE_BACKEND_URL must be an HTTPS origin, such as https://your-app.onrender.com');
    }
  }
  return {
    base: command === 'build' ? '/CSCI3210/MIDTERM/' : '/',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8000' },
        '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
      },
    },
  };
});
