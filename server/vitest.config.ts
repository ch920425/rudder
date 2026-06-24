import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Bundled-skill `.mjs` suites use Node's built-in test runner (node:test),
    // not vitest. Vitest's default glob would pick them up and fail with
    // "No test suite found". They run via `pnpm test:bundled-skills` instead.
    exclude: [
      ...configDefaults.exclude,
      "resources/bundled-skills/**/tests/*.test.mjs",
    ],
  },
});
