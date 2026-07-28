import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("antd") || id.includes("@ant-design") || id.includes("@rc-component") || id.includes("rc-")) {
            return "antd";
          }
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) {
            return "charts";
          }
          if (id.includes("react-icons") || id.includes("lucide-react")) {
            return "icons";
          }
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
