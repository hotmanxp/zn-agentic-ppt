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
  },
});
