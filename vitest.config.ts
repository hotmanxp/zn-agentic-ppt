import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the renderer tsconfig (jsx: "react-jsx") so test files can
  // use <Foo /> syntax without an explicit `import React` line.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    // The SDK bridge (zai-bridge.ts) and runner.ts import `electron` for
    // `app.getPath`. Vitest cannot load the real Electron binary (which
    // expects to be launched as the main process), so we inline it and
    // stub it via `vi.mock("electron", ...)` in any test that loads the
    // bridge transitively.
    server: {
      deps: {
        inline: ["electron"],
      },
    },
  },
});
