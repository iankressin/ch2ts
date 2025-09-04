import { describe, expect, it } from "vitest";
import {
  generateSource,
  type EmissionOptions,
  type MappingOptions,
} from "./index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const simpleSqlPath = resolve(
  process.cwd(),
  "testdata/simple/create_simple.sql",
);
const goldenDefaultPath = resolve(
  process.cwd(),
  "testdata/golden/simple.default.ts",
);
const goldenZodPath = resolve(process.cwd(), "testdata/golden/simple.zod.ts");

const baseMap: MappingOptions = {
  int64As: "bigint",
  decimal: "string",
  datetimeAs: "string",
  camelCase: true,
};

describe("golden snapshots (core)", () => {
  it("simple → default", () => {
    const ddl = readFileSync(simpleSqlPath, "utf8");
    const out = generateSource(ddl, baseMap, {
      emitZod: false,
    } satisfies EmissionOptions);
    const golden = readFileSync(goldenDefaultPath, "utf8");
    expect(out.trim()).toBe(golden.trim());
  });

  it("simple → zod", () => {
    const ddl = readFileSync(simpleSqlPath, "utf8");
    const out = generateSource(ddl, baseMap, {
      emitZod: true,
    } satisfies EmissionOptions);
    const golden = readFileSync(goldenZodPath, "utf8");
    expect(out.trim()).toBe(golden.trim());
  });
});
