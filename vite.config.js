import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is required: phones only expose tilt sensors to secure pages.
// basicSsl generates a self-signed certificate (you'll click through a warning once).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true, // listen on the LAN so the phone can reach it
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': { target: 'http://localhost:3001' },
    },
  },
});
