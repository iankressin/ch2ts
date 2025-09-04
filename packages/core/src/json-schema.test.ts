import { describe, expect, it } from "vitest";
import { emitJsonSchema, map, parse, type MappingOptions } from "./index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const simpleSqlPath = resolve(
  process.cwd(),
  "testdata/simple/create_simple.sql",
);
const goldenSchemaPath = resolve(
  process.cwd(),
  "testdata/golden/simple.schema.json",
);

const baseMap: MappingOptions = {
  int64As: "bigint",
  decimal: "string",
  datetimeAs: "string",
  camelCase: true,
};

describe("JSON Schema emission", () => {
  it("matches golden for simple table", () => {
    const ddl = readFileSync(simpleSqlPath, "utf8");
    const json = emitJsonSchema(map(parse(ddl), baseMap));
    const golden = readFileSync(goldenSchemaPath, "utf8");
    expect(json.trim()).toBe(golden.trim());
  });
});
