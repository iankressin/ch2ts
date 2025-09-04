import { describe, expect, it } from "vitest";
import {
  emit,
  map,
  parse,
  type EmissionOptions,
  type MappingOptions,
} from "./index.js";

describe("emitter (ts-morph)", () => {
  const baseMap: MappingOptions = {
    int64As: "bigint",
    decimal: "string",
    datetimeAs: "string",
    camelCase: true,
  };

  it("emits interface with JSDoc and branded types", () => {
    const ddl = `
      /* block comment */
      CREATE TABLE db.events (
        ip IPv4 COMMENT 'client ip',
        id UInt64,
        name String -- trailing
      );
    `;
    const ast = parse(ddl);
    const mapped = map(ast, baseMap);
    const out = emit(mapped, { emitZod: false } satisfies EmissionOptions);
    expect(out).toMatchSnapshot();
  });

  it("emits zod schemas for simple types", () => {
    const ddl = `CREATE TABLE t (a UInt64, b Nullable(String), c Array(UInt32));`;
    const ast = parse(ddl);
    const mapped = map(ast, baseMap);
    const out = emit(mapped, { emitZod: true } satisfies EmissionOptions);
    expect(out).toMatchSnapshot();
  });
});
