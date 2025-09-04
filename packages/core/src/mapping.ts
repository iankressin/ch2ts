import type { MappingOptions, MappedTable, TableAst, TypeAst, TypeArg, EnumMember } from './types.js';
import { toCamelCase, toPascalCase } from './types.js';

/** Map a ClickHouse TypeAst to a TypeScript type string. */
export function mapTypeAstToTs(type: TypeAst, options: MappingOptions): string {
  // Plugin override
  const fromPlugins = options.plugins?.map((p) => p.mapType(type, { options })).find((r) => typeof r === 'string');
  if (fromPlugins) return fromPlugins;
  const name = type.name;
  switch (name) {
    case 'Nullable': {
      const inner = firstTypeArg(type);
      const innerTs = mapTypeAstToTs(inner, options);
      return `${innerTs} | null`;
    }
    case 'LowCardinality': {
      const inner = firstTypeArg(type);
      return mapTypeAstToTs(inner, options);
    }
    case 'Array': {
      const inner = firstTypeArg(type);
      return `${mapTypeAstToTs(inner, options)}[]`;
    }
    case 'Tuple': {
      const parts = type.args.map((a, i) => `_${i}: ${mapTypeAstToTs(toTypeOrUnknown(a), options)};`);
      return `{ ${parts.join(' ')} }`;
    }
    case 'Map': {
      const value = secondTypeArg(type);
      return `Record<string, ${mapTypeAstToTs(value, options)}>`;
    }
    case 'Enum8':
    case 'Enum16': {
      const keys = type.args
        .map((a) => (typeof a === 'object' && 'key' in a ? (a as EnumMember).key : undefined))
        .filter((k): k is string => typeof k === 'string');
      return keys.length > 0 ? keys.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(' | ') : 'string';
    }
    case 'Decimal': {
      return options.decimal === 'decimal.js' ? 'Decimal' : 'string';
    }
    case 'Float32':
    case 'Float64':
    case 'Int8':
    case 'Int16':
    case 'Int32':
    case 'UInt8':
    case 'UInt16':
    case 'UInt32':
      return 'number';
    case 'Int64':
    case 'UInt64':
      return options.int64As === 'bigint' ? 'bigint' : 'string';
    case 'String':
    case 'UUID':
    case 'FixedString':
    case 'IPv4':
    case 'IPv6':
      return 'string';
    case 'Date':
    case 'DateTime':
    case 'DateTime64':
      return options.datetimeAs === 'Date' ? 'Date' : 'string';
    default: {
      if (options.failOnUnknown) {
        throw new Error(`Unknown type: ${name}`);
      }
      return 'unknown';
    }
  }
}

export function map(tables: readonly TableAst[], options: MappingOptions): readonly MappedTable[] {
  return tables.map((t) => ({
    interfaceName: toPascalCase(t.name),
    columns: t.columns.map((c) => {
      const chType = c.rawType.trim();
      const tsType = mapTypeAstToTs(c.type, options);
      return {
        name: options.camelCase ? toCamelCase(c.name) : c.name,
        tsType,
        chType,
        typeAst: c.type,
        comment: c.comment
      };
    }),
    meta: { partitionBy: t.partitionBy, orderBy: t.orderBy }
  }));
}

function isTypeAst(arg: TypeArg | undefined): arg is TypeAst {
  return typeof arg === 'object' && arg !== null && 'name' in arg && 'args' in arg;
}
function toTypeOrUnknown(arg: TypeArg | undefined): TypeAst {
  return isTypeAst(arg) ? arg : { name: 'Unknown', args: [] };
}
function firstTypeArg(t: TypeAst): TypeAst { return toTypeOrUnknown(t.args[0]); }
function secondTypeArg(t: TypeAst): TypeAst { return toTypeOrUnknown(t.args[1]); }
