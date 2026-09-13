import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const AGENT_PORT = process.env.OPENLOOP_AGENT_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT ?? 5173),
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${AGENT_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
