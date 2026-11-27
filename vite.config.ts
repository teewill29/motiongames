import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from any static host path (e.g. GitHub Pages).
  base: "./",
  server: {
    // localhost is a secure context, so the camera works without HTTPS.
    host: "localhost",
    port: 5173,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
