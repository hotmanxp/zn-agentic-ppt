import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  resolve: {
    alias: { "@shared": resolve(__dirname, "src/shared") },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
  server: { port: 5173 },
});
