import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    environment: "node",
    globals: true,
    snapshotFormat: { printBasicPrototype: false },
    threads: false,
    pool: "forks",
  },
});
