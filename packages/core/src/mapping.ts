import type {
  MappingOptions,
  MappedTable,
  TableAst,
  TypeAst,
  TypeArg,
  EnumMember,
} from "./types.js";
import { toCamelCase, toPascalCase } from "./types.js";

/** Map a ClickHouse TypeAst to a TypeScript type string. */
export function mapTypeAstToTs(type: TypeAst, options: MappingOptions): string {
  // Plugin override
  const fromPlugins = options.plugins
    ?.map((p) => p.mapType(type, { options }))
    .find((r) => typeof r === "string");
  if (fromPlugins) return fromPlugins;
  const name = type.name;
  switch (name) {
    case "Nullable": {
      const inner = firstTypeArg(type);
      const innerTs = mapTypeAstToTs(inner, options);
      return `${innerTs} | null`;
    }
    case "LowCardinality": {
      const inner = firstTypeArg(type);
      return mapTypeAstToTs(inner, options);
    }
    case "Array": {
      const inner = firstTypeArg(type);
      return `${mapTypeAstToTs(inner, options)}[]`;
    }
    case "Tuple": {
      const parts = type.args.map(
        (a, i) => `_${i}: ${mapTypeAstToTs(toTypeOrUnknown(a), options)};`,
      );
      return `{ ${parts.join(" ")} }`;
    }
    case "Map": {
      const value = secondTypeArg(type);
      return `Record<string, ${mapTypeAstToTs(value, options)}>`;
    }
    case "Enum8":
    case "Enum16": {
      const keys = type.args
        .map((a) =>
          typeof a === "object" && "key" in a
            ? (a as EnumMember).key
            : undefined,
        )
        .filter((k): k is string => typeof k === "string");
      return keys.length > 0
        ? keys.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(" | ")
        : "string";
    }
    case "Decimal": {
      return options.decimal === "decimal.js" ? "Decimal" : "string";
    }
    case "Float32":
    case "Float64":
    case "Int8":
    case "Int16":
    case "Int32":
    case "UInt8":
    case "UInt16":
    case "UInt32":
      return "number";
    case "Int64":
    case "UInt64":
      return options.int64As === "bigint" ? "bigint" : "string";
    case "String":
    case "UUID":
    case "FixedString":
    case "IPv4":
    case "IPv6":
      return "string";
    case "Date":
    case "DateTime":
    case "DateTime64":
      return options.datetimeAs === "Date" ? "Date" : "string";
    default: {
      if (options.failOnUnknown) {
        throw new Error(`Unknown type: ${name}`);
      }
      return "unknown";
    }
  }
}

export function map(
  tables: readonly TableAst[],
  options: MappingOptions,
): readonly MappedTable[] {
  return tables.map((t) => {
    const src = t.mvFrom ? findTableByName(tables, t.mvFrom) : undefined;
    const aliasMap = buildAliasMap(t);
    const mvInfo = buildMvInfoMap(t);
    const cteMap = buildCteAliasMap(t);
    const cteSrc = t.mvCte?.src
      ? findTableByName(tables, t.mvCte.src)
      : undefined;
    const cols = t.columns.map((c) => {
      let type = c.type;
      let raw = c.rawType;
      if (type.name === "Unknown" && src) {
        // Try to resolve by same-name column first
        let sourceName = c.name;
        // If MV had an alias mapping, use the original source column name
        const mapped = aliasMap.get(c.name);
        if (mapped) sourceName = mapped;
        const sc = findColumnByName(src, sourceName);
        if (sc) {
          type = sc.type;
          raw = sc.rawType;
        }
      } else if (type.name === "Unknown" && !src) {
        // FROM CTE: resolve via final-select info → CTE alias → base table
        const info = mvInfo.get(c.name);
        if (info) {
          const cte = info.src ? cteMap.get(info.src) : undefined;
          let baseType: TypeAst | undefined;
          if (cte) {
            if (cte.func) {
              baseType = mapFuncToType(cte.func);
            }
            if (
              (!baseType || baseType.name === "Unknown") &&
              cteSrc &&
              cte.src
            ) {
              const sc = findColumnByName(cteSrc, cte.src);
              baseType = sc?.type;
            }
          }
          const resolved = resolveAggReturnType(info.func, baseType);
          if (resolved) type = resolved;
          else if (!info.func) type = { name: "String", args: [] }; // plain identifiers fallback
        } else {
          // No info: fallback to string
          type = { name: "String", args: [] };
        }
      }
      const chType = raw.trim();
      const tsType = mapTypeAstToTs(type, options);
      return {
        name: options.camelCase ? toCamelCase(c.name) : c.name,
        tsType,
        chType,
        typeAst: type,
        comment: c.comment,
      };
    });
    return {
      interfaceName: toPascalCase(t.name),
      columns: cols,
      meta: { partitionBy: t.partitionBy, orderBy: t.orderBy },
    };
  });
}

function buildAliasMap(t: TableAst): Map<string, string> {
  const map = new Map<string, string>();
  if (t.mvSelect) {
    for (const item of t.mvSelect) {
      if (item.alias) {
        // Prefer mapping alias to captured source column name when present; fallback to item.name
        map.set(item.alias, item.srcName ?? item.name);
      }
    }
  }
  return map;
}

function buildMvInfoMap(
  t: TableAst,
): Map<string, { func?: string; src?: string }> {
  const res = new Map<string, { func?: string; src?: string }>();
  if (!t.mvSelect) return res;
  for (const item of t.mvSelect) {
    const key = item.alias ?? item.name;
    res.set(key, { func: item.func, src: item.srcName });
  }
  return res;
}

function buildCteAliasMap(
  t: TableAst,
): Map<string, { func?: string; src?: string }> {
  const res = new Map<string, { func?: string; src?: string }>();
  if (!t.mvCte) return res;
  for (const it of t.mvCte.columns) {
    const key = it.alias ?? it.name;
    res.set(key, { func: it.func, src: it.srcName ?? it.name });
  }
  return res;
}

function mapFuncToType(fn: string): TypeAst {
  const f = fn.toLowerCase();
  if (f.startsWith("tofloat")) return { name: "Float64", args: [] };
  if (f.startsWith("toint")) return { name: "Int64", args: [] };
  if (f.startsWith("touint")) return { name: "UInt64", args: [] };
  if (f.startsWith("todecimal")) return { name: "Decimal", args: [] };
  if (f === "tostartofday") return { name: "DateTime", args: [] };
  return { name: "Unknown", args: [] };
}

function resolveAggReturnType(
  func: string | undefined,
  base: TypeAst | undefined,
): TypeAst | undefined {
  if (!func) return base;
  const f = func.toLowerCase();
  if (f === "tostartofday") return { name: "DateTime", args: [] };
  if (/^sum/.test(f) || /^avg/.test(f)) return { name: "Float64", args: [] };
  if (/^count/.test(f)) return { name: "Float64", args: [] };
  if (/^anylast/.test(f)) return base ?? { name: "Unknown", args: [] };
  if (
    /^max/.test(f) ||
    /^min/.test(f) ||
    /^argmin/.test(f) ||
    /^argmax/.test(f)
  )
    return base ?? { name: "Unknown", args: [] };
  return base;
}

function findTableByName(
  tables: readonly TableAst[],
  name: string,
): TableAst | undefined {
  return (
    tables.find((x) => x.name === name) ||
    tables.find((x) => toPascalCase(x.name) === toPascalCase(name))
  );
}
function findColumnByName(table: TableAst, name: string) {
  return table.columns.find(
    (cc) => cc.name === name || toCamelCase(cc.name) === toCamelCase(name),
  );
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
