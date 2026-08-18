import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: "0.0.0.0",
    port: 3781,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3780",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers.host) {
              proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
              proxyReq.setHeader("X-Forwarded-Proto", "http");
            }
          });
        },
      },
      "/static": {
        target: "http://127.0.0.1:3780",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers.host) {
              proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
              proxyReq.setHeader("X-Forwarded-Proto", "http");
            }
          });
        },
      },
    },
  },
});
