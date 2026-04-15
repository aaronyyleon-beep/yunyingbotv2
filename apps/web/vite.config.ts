import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["go2marsops.com"]
  },
  server: {
    port: 5173,
    proxy: {
      "/tasks": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/auth": "http://localhost:3000"
    }
  }
});
