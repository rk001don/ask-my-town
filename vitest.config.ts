import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // happy-dom rather than jsdom: these tests touch localStorage and a couple
    // of DOM APIs, not layout, and happy-dom starts in a fraction of the time.
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      // Only the pure logic is measured. Route components need a router, a
      // query client and a live Supabase to render, so they are covered by the
      // Playwright suite instead -- counting them here would report a
      // misleadingly low number for code that is genuinely tested elsewhere.
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/*.functions.ts", "src/lib/*.server.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
