import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // Default to node; component tests opt in by adding `// @vitest-environment happy-dom`
    // at the top of the file (works since vitest 0.34+).
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      include: ["src/safety/**/*.ts", "src/components/**/*.tsx"],
      reporter: ["text", "html"],
    },
  },
});
