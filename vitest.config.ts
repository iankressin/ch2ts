import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ch2ts/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@ch2ts/presets": resolve(__dirname, "packages/presets/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    environment: "node",
    globals: true,
    snapshotFormat: { printBasicPrototype: false },
    threads: false,
    pool: "forks",
  },
});
