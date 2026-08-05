// @ts-nocheck
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "bun:test": path.resolve(__dirname, "./src/testing/bun-mock.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
} as any);
