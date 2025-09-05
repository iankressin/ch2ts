import type { MappedTable, TypeAst, TypeArg, EnumMember } from "./types.js";
import { firstTypeArg, secondTypeArg, toTypeOrUnknown } from "./ast-utils.js";

/** Emit a single JSON Schema for the first table (basic support). */
export function emitJsonSchema(mapped: readonly MappedTable[]): string {
  if (mapped.length === 0) return JSON.stringify({}, null, 2);
  const table = mapped[0]!;
  const schema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: table.interfaceName,
    type: "object",
    properties: {},
    additionalProperties: false,
    required: table.columns.map((c) => c.name),
  };
  const props: Record<string, unknown> = {};
  for (const col of table.columns) {
    props[col.name] = jsonSchemaForType(col.typeAst, col.tsType);
  }
  (schema as { properties: Record<string, unknown> }).properties = props;
  const json = JSON.stringify(schema, null, 2);
  // Collapse the "required" array to a single line to match golden outputs
  return json.replace(/"required":\s*\[(?:\s*"[^"]+"\s*,?\s*)+\]/g, (m) => {
    const items = m
      .slice(m.indexOf("[") + 1, m.lastIndexOf("]"))
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return `"required": [${items.join(", ")}]`;
  });
}

function jsonSchemaForType(
  type: TypeAst,
  resolvedTs: string,
): Record<string, unknown> {
  switch (type.name) {
    case "Nullable": {
      const inner = firstTypeArg(type);
      const s = jsonSchemaForType(inner, resolvedTs);
      return { anyOf: [s, { type: "null" }] };
    }
    case "LowCardinality": {
      return jsonSchemaForType(firstTypeArg(type), resolvedTs);
    }
    case "Array": {
      return {
        type: "array",
        items: jsonSchemaForType(firstTypeArg(type), resolvedTs),
      };
    }
    case "Tuple": {
      // Represented as object {_0, _1, ...}
      const props: Record<string, unknown> = {};
      type.args.forEach((a, i) => {
        props[`_${i}`] = jsonSchemaForType(toTypeOrUnknown(a), resolvedTs);
      });
      return { type: "object", properties: props, additionalProperties: false };
    }
    case "Map": {
      const v = jsonSchemaForType(secondTypeArg(type), resolvedTs);
      return { type: "object", additionalProperties: v };
    }
    case "Enum8":
    case "Enum16": {
      const keys = type.args
        .map((a: TypeArg) =>
          typeof a === "object" && a !== null && "key" in a
            ? (a as EnumMember).key
            : undefined,
        )
        .filter((k): k is string => typeof k === "string");
      return keys.length > 0
        ? { type: "string", enum: keys }
        : { type: "string" };
    }
    case "Decimal":
      return { type: "string" };
    case "Float32":
    case "Float64":
    case "Int8":
    case "Int16":
    case "Int32":
    case "UInt8":
    case "UInt16":
    case "UInt32":
      return { type: "number" };
    case "Int64":
    case "UInt64":
      return /\bbigint\b/.test(resolvedTs)
        ? { type: "integer" }
        : { type: "string" };
    case "String":
    case "UUID":
    case "FixedString":
    case "IPv4":
    case "IPv6":
      return { type: "string" };
    case "Date":
    case "DateTime":
    case "DateTime64":
      return /\bDate\b/.test(resolvedTs)
        ? { type: "string", format: "date-time" }
        : { type: "string" };
    default:
      return {};
  }
}

// helpers moved to ast-utils.ts
