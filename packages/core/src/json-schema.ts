import type { MappedTable, TypeAst, TypeArg, EnumMember } from "./types.js";

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
  return JSON.stringify(schema, null, 2);
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

function isTypeAst(arg: TypeArg | undefined): arg is TypeAst {
  return (
    typeof arg === "object" && arg !== null && "name" in arg && "args" in arg
  );
}
function toTypeOrUnknown(arg: TypeArg | undefined): TypeAst {
  return isTypeAst(arg) ? arg : { name: "Unknown", args: [] };
}
function firstTypeArg(t: TypeAst): TypeAst {
  return toTypeOrUnknown(t.args[0]);
}
function secondTypeArg(t: TypeAst): TypeAst {
  return toTypeOrUnknown(t.args[1]);
}
