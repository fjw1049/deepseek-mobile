import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
const runtimeSource = resolve(
  process.env.RUNTIME_SOURCE || "../deepseek-tui-py-main",
);
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@runtime-audio-recorder": resolve(
        runtimeSource,
        "packages/workbench/src/renderer/src/hooks/use-audio-recorder.ts",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
        },
      },
    },
  },
  server: {
    port: 5178,
    strictPort: true,
    fs: { allow: [process.cwd(), runtimeSource] },
    proxy: {
      "/runtime": {
        target: process.env.RUNTIME_URL || "http://127.0.0.1:7878",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/runtime/, ""),
      },
    },
  },
});
