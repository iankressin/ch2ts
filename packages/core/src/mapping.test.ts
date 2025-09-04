import { describe, expect, it } from "vitest";
import { mapTypeAstToTs, type MappingOptions, type TypeAst } from "./index.js";

const base: Omit<MappingOptions, "camelCase"> = {
  int64As: "bigint",
  decimal: "string",
  datetimeAs: "string",
  failOnUnknown: true,
};

function t(name: string, args: TypeAst["args"] = []): TypeAst {
  return { name, args };
}

describe("type mapping", () => {
  it("maps primitives and wrappers", () => {
    const opts: MappingOptions = { ...base, camelCase: false };
    expect(mapTypeAstToTs(t("UInt64"), opts)).toBe("bigint");
    expect(mapTypeAstToTs(t("Int32"), opts)).toBe("number");
    expect(mapTypeAstToTs(t("String"), opts)).toBe("string");
    expect(mapTypeAstToTs(t("DateTime"), opts)).toBe("string");
    expect(mapTypeAstToTs(t("Decimal", [10, 2]), opts)).toBe("string");
    expect(mapTypeAstToTs(t("Array", [t("String")]), opts)).toBe("string[]");
    expect(mapTypeAstToTs(t("Nullable", [t("UInt64")]), opts)).toBe(
      "bigint | null",
    );
  });

  it("maps enums to string unions", () => {
    const opts: MappingOptions = { ...base, camelCase: false };
    const tt: TypeAst = {
      name: "Enum8",
      args: [
        { key: "A", value: 1 },
        { key: "B", value: 2 },
      ],
    };
    expect(mapTypeAstToTs(tt, opts)).toBe("'A' | 'B'");
  });

  it("maps tuple to structured object", () => {
    const opts: MappingOptions = { ...base, camelCase: false };
    const tt = t("Tuple", [t("String"), t("UInt32")]);
    expect(mapTypeAstToTs(tt, opts)).toBe("{ _0: string; _1: number; }");
  });

  it("respects bigint and decimal.js presets", () => {
    const bigintOpts: MappingOptions = {
      ...base,
      int64As: "string",
      camelCase: false,
    };
    const decimalJsOpts: MappingOptions = {
      ...base,
      camelCase: false,
      decimal: "decimal.js",
    };
    expect(mapTypeAstToTs(t("UInt64"), bigintOpts)).toBe("string");
    expect(mapTypeAstToTs(t("Decimal", [38, 10]), decimalJsOpts)).toBe(
      "Decimal",
    );
  });
});
