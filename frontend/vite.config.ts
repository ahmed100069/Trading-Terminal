import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const FRONTEND_PORT = 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: FRONTEND_PORT,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: FRONTEND_PORT,
    strictPort: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "recharts", "lightweight-charts"],
  },
});
