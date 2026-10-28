import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    // Listen on the LAN so a phone on the same Wi-Fi/hotspot can open QR links.
    host: "0.0.0.0",
    port: 5173,

    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "172.20.10.8",
    ],

    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
      },
    },
  },
});
