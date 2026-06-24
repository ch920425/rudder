import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Never scan staged/packaged build artifacts; they contain copies of
    // server resources (including node:test `.mjs` suites) that vitest cannot
    // run and that are not part of the desktop test surface.
    exclude: [
      ...configDefaults.exclude,
      "**/.packaged/**",
      "**/release/**",
      "**/resources/bundled-skills/**/tests/*.test.mjs",
    ],
  },
});
