import type {
  MappingOptions,
  MappedTable,
  TableAst,
  TypeAst,
  TypeArg,
  EnumMember,
} from "./types.js";
import { toCamelCase, toPascalCase } from "./types.js";
import {
  assert,
  firstTypeArg,
  secondTypeArg,
  toTypeOrUnknown,
} from "./ast-utils.js";

/** Maximum recursion depth for type mapping safety. */
const MAX_TYPE_DEPTH = 20;

/** Maximum number of enum keys to process. */
const MAX_ENUM_KEYS = 1000;

/** Maximum number of tuple elements to process. */
const MAX_TUPLE_ELEMENTS = 100;

/**
 * Map a ClickHouse TypeAst to a TypeScript type string.
 * Converts ClickHouse types to TypeScript with configurable options and plugin support.
 * Uses bounded recursion and explicit limits for safety.
 * @param {TypeAst} type - ClickHouse type AST to convert
 * @param {MappingOptions} options - Configuration for type mapping
 * @param {number} [depth=0] - Current recursion depth for safety bounds
 * @returns {string} TypeScript type string
 * @throws {Error} When type is invalid, options are malformed, or depth exceeded
 */
export function mapTypeAstToTs(
  type: TypeAst,
  options: MappingOptions,
  depth = 0,
): string {
  // Safety bounds
  if (depth > MAX_TYPE_DEPTH) {
    throw new Error(`Type mapping depth exceeded ${MAX_TYPE_DEPTH}`);
  }

  // Validate inputs
  validateTypeAst(type);
  validateMappingOptions(options);

  // Plugin override (highest priority)
  const pluginResult = tryPluginMapping(type, options);
  if (pluginResult) return pluginResult;

  // Core type mapping
  return mapCoreType(type, options, depth);
}

/**
 * Validate TypeAst structure and content.
 * @param {TypeAst} type - Type to validate
 * @throws {Error} When type structure is invalid
 */
function validateTypeAst(type: TypeAst): void {
  assert(
    typeof type.name === "string" && Array.isArray(type.args),
    "Invalid TypeAst: must have string name and args array",
  );
  assert(type.name.length > 0, "TypeAst name cannot be empty");
  assert(
    type.args.length <= MAX_TUPLE_ELEMENTS,
    `Too many type args: ${type.args.length}`,
  );
}

/**
 * Validate MappingOptions configuration.
 * @param {MappingOptions} options - Options to validate
 * @throws {Error} When options are invalid
 */
function validateMappingOptions(options: MappingOptions): void {
  assert(
    options.int64As === "bigint" || options.int64As === "string",
    "MappingOptions.int64As must be 'bigint' or 'string'",
  );
  assert(
    options.decimal === "string" || options.decimal === "decimal.js",
    "MappingOptions.decimal must be 'string' or 'decimal.js'",
  );
  assert(
    options.datetimeAs === "string" || options.datetimeAs === "Date",
    "MappingOptions.datetimeAs must be 'string' or 'Date'",
  );
}

/**
 * Try plugin-based type mapping.
 * @param {TypeAst} type - Type to map
 * @param {MappingOptions} options - Mapping options
 * @returns {string | undefined} Plugin result or undefined
 */
function tryPluginMapping(
  type: TypeAst,
  options: MappingOptions,
): string | undefined {
  if (!options.plugins || options.plugins.length === 0) return undefined;

  const maxPlugins = 50; // Safety limit
  const pluginsToTry = options.plugins.slice(0, maxPlugins);

  for (const plugin of pluginsToTry) {
    const result = plugin.mapType(type, { options });
    if (typeof result === "string") return result;
  }

  return undefined;
}

/**
 * Map core ClickHouse types to TypeScript.
 * Central control flow for type mapping with delegated handlers.
 * @param {TypeAst} type - Type to map
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} TypeScript type string
 */
function mapCoreType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const name = type.name;

  switch (name) {
    case "Nullable":
      return mapNullableType(type, options, depth);
    case "LowCardinality":
      return mapLowCardinalityType(type, options, depth);
    case "Array":
      return mapArrayType(type, options, depth);
    case "Tuple":
      return mapTupleType(type, options, depth);
    case "Map":
      return mapMapType(type, options, depth);
    case "Enum8":
    case "Enum16":
      return mapEnumType(type);
    case "Decimal":
      return mapDecimalType(options);
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
      return mapBigIntType(options);
    case "String":
    case "UUID":
    case "FixedString":
    case "IPv4":
    case "IPv6":
      return "string";
    case "Date":
    case "DateTime":
    case "DateTime64":
      return mapDateTimeType(options);
    default:
      return handleUnknownType(name, options);
  }
}

/**
 * Map Nullable(T) to T | null.
 * @param {TypeAst} type - Nullable type
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} TypeScript union type
 */
function mapNullableType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  const innerTs = mapTypeAstToTs(inner, options, depth + 1);
  return `${innerTs} | null`;
}

/**
 * Map LowCardinality(T) to T (no-op wrapper).
 * @param {TypeAst} type - LowCardinality type
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} Inner type string
 */
function mapLowCardinalityType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  return mapTypeAstToTs(inner, options, depth + 1);
}

/**
 * Map Array(T) to T[].
 * @param {TypeAst} type - Array type
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} TypeScript array type
 */
function mapArrayType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  const innerTs = mapTypeAstToTs(inner, options, depth + 1);
  return `${innerTs}[]`;
}

/**
 * Map Tuple(T1,T2,...) to structured object.
 * @param {TypeAst} type - Tuple type
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} TypeScript object type
 */
function mapTupleType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const argCount = Math.min(type.args.length, MAX_TUPLE_ELEMENTS);
  const parts: string[] = [];

  for (let i = 0; i < argCount; i++) {
    const arg = type.args[i];
    const argType = mapTypeAstToTs(toTypeOrUnknown(arg), options, depth + 1);
    parts.push(`_${i}: ${argType};`);
  }

  return `{ ${parts.join(" ")} }`;
}

/**
 * Map Map(K,V) to Record<string, V>.
 * Note: ClickHouse maps always use string keys in TypeScript.
 * @param {TypeAst} type - Map type
 * @param {MappingOptions} options - Mapping options
 * @param {number} depth - Current recursion depth
 * @returns {string} TypeScript Record type
 */
function mapMapType(
  type: TypeAst,
  options: MappingOptions,
  depth: number,
): string {
  const value = secondTypeArg(type);
  const valueTs = mapTypeAstToTs(value, options, depth + 1);
  return `Record<string, ${valueTs}>`;
}

/**
 * Map Enum8/Enum16 to string union type.
 * @param {TypeAst} type - Enum type
 * @returns {string} TypeScript string union or fallback
 */
function mapEnumType(type: TypeAst): string {
  const keys = extractEnumKeys([...type.args]); // Convert readonly to mutable

  if (keys.length === 0) return "string";

  const quotedKeys = keys.map((key) => `'${escapeStringLiteral(key)}'`);
  return quotedKeys.join(" | ");
}

/**
 * Extract enum keys from type arguments with safety bounds.
 * @param {TypeArg[]} args - Type arguments
 * @returns {string[]} Array of enum key strings
 */
function extractEnumKeys(args: TypeArg[]): string[] {
  const maxKeys = Math.min(args.length, MAX_ENUM_KEYS);
  const keys: string[] = [];

  for (let i = 0; i < maxKeys; i++) {
    const arg = args[i];
    if (typeof arg === "object" && arg !== null && "key" in arg) {
      const member = arg as EnumMember;
      if (typeof member.key === "string" && member.key.length > 0) {
        keys.push(member.key);
      }
    }
  }

  return keys;
}

/**
 * Escape single quotes in string literals.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeStringLiteral(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Map Decimal type based on options.
 * @param {MappingOptions} options - Mapping options
 * @returns {string} TypeScript type for decimals
 */
function mapDecimalType(options: MappingOptions): string {
  return options.decimal === "decimal.js" ? "Decimal" : "string";
}

/**
 * Map Int64/UInt64 based on options.
 * @param {MappingOptions} options - Mapping options
 * @returns {string} TypeScript type for big integers
 */
function mapBigIntType(options: MappingOptions): string {
  return options.int64As === "bigint" ? "bigint" : "string";
}

/**
 * Map DateTime types based on options.
 * @param {MappingOptions} options - Mapping options
 * @returns {string} TypeScript type for dates
 */
function mapDateTimeType(options: MappingOptions): string {
  return options.datetimeAs === "Date" ? "Date" : "string";
}

/**
 * Handle unknown types with configurable behavior.
 * @param {string} name - Unknown type name
 * @param {MappingOptions} options - Mapping options
 * @returns {string} Fallback type or throws
 * @throws {Error} When failOnUnknown is true
 */
function handleUnknownType(name: string, options: MappingOptions): string {
  if (options.failOnUnknown) {
    throw new Error(`Unknown type: ${name}`);
  }
  return "unknown";
}

/** Maximum number of tables to process for safety. */
const MAX_TABLES = 1000;

/** Maximum number of columns per table for safety. */
const MAX_COLUMNS_PER_TABLE = 10000;

/**
 * Map array of TableAst to MappedTable with type resolution.
 * Processes table schemas and resolves materialized view column types through source tables.
 * Uses bounded operations and explicit limits for safety.
 * @param {readonly TableAst[]} tables - Array of parsed table ASTs
 * @param {MappingOptions} options - Configuration for type mapping
 * @returns {readonly MappedTable[]} Array of mapped tables with TypeScript types
 * @throws {Error} When table count or structure exceeds safety limits
 */
export function map(
  tables: readonly TableAst[],
  options: MappingOptions,
): readonly MappedTable[] {
  // Safety bounds
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);

  // Validate all tables upfront
  validateTableArray(tables);

  // Process each table with bounded operations
  const mappedTables: MappedTable[] = [];

  for (const table of tables) {
    const mappedTable = mapSingleTable(table, tables, options);
    mappedTables.push(mappedTable);
  }

  return mappedTables;
}

/**
 * Validate array of TableAst structures.
 * @param {readonly TableAst[]} tables - Tables to validate
 * @throws {Error} When any table is invalid
 */
function validateTableArray(tables: readonly TableAst[]): void {
  for (const table of tables) {
    assert(
      typeof table.name === "string" && Array.isArray(table.columns),
      `Invalid TableAst: name=${table.name}, columns=${Array.isArray(table.columns)}`,
    );
    assert(table.name.length > 0, "Table name cannot be empty");
    assert(
      table.columns.length <= MAX_COLUMNS_PER_TABLE,
      `Too many columns in table ${table.name}: ${table.columns.length}`,
    );
  }
}

/**
 * Map single table to MappedTable with type resolution.
 * Central control flow for table mapping with delegated column processing.
 * @param {TableAst} table - Table to map
 * @param {readonly TableAst[]} allTables - All tables for reference lookup
 * @param {MappingOptions} options - Mapping options
 * @returns {MappedTable} Mapped table with resolved types
 */
function mapSingleTable(
  table: TableAst,
  allTables: readonly TableAst[],
  options: MappingOptions,
): MappedTable {
  // Build lookup structures
  const context = createMappingContext(table, allTables);

  // Map all columns
  const columns = mapTableColumns(table, context, options);

  return {
    interfaceName: toPascalCase(table.name),
    columns,
    meta: {
      partitionBy: table.partitionBy,
      orderBy: table.orderBy,
    },
  };
}

/**
 * Mapping context for type resolution.
 */
interface MappingContext {
  readonly sourceTable?: TableAst;
  readonly aliasMap: Map<string, string>;
  readonly mvInfoMap: Map<string, { func?: string; src?: string }>;
  readonly cteAliasMap: Map<string, { func?: string; src?: string }>;
  readonly cteSourceTable?: TableAst;
}

/**
 * Create mapping context with lookup structures.
 * @param {TableAst} table - Current table
 * @param {readonly TableAst[]} allTables - All available tables
 * @returns {MappingContext} Context for type resolution
 */
function createMappingContext(
  table: TableAst,
  allTables: readonly TableAst[],
): MappingContext {
  const sourceTable = table.mvFrom
    ? findTableByName(allTables, table.mvFrom)
    : undefined;

  const cteSourceTable = table.mvCte?.src
    ? findTableByName(allTables, table.mvCte.src)
    : undefined;

  return {
    sourceTable,
    aliasMap: buildAliasMap(table),
    mvInfoMap: buildMvInfoMap(table),
    cteAliasMap: buildCteAliasMap(table),
    cteSourceTable,
  };
}

/**
 * Map all columns in a table with type resolution.
 * @param {TableAst} table - Table containing columns
 * @param {MappingContext} context - Mapping context
 * @param {MappingOptions} options - Mapping options
 * @returns {Array} Array of mapped columns
 */
function mapTableColumns(
  table: TableAst,
  context: MappingContext,
  options: MappingOptions,
): Array<{
  name: string;
  tsType: string;
  chType: string;
  typeAst: TypeAst;
  comment?: string;
}> {
  const columns = [];

  for (const column of table.columns) {
    validateColumn(column);
    const mappedColumn = mapSingleColumn(column, context, options);
    columns.push(mappedColumn);
  }

  return columns;
}

/**
 * Validate column structure.
 * @param {any} column - Column to validate
 * @throws {Error} When column is invalid
 */
function validateColumn(column: any): void {
  assert(
    typeof column.name === "string" && !!column.type,
    `Invalid ColumnAst: name=${column.name}, type=${!!column.type}`,
  );
  assert(column.name.length > 0, "Column name cannot be empty");
}

/**
 * Map single column with type resolution.
 * Handles Unknown type resolution through source tables and CTEs.
 * @param {any} column - Column to map
 * @param {MappingContext} context - Mapping context
 * @param {MappingOptions} options - Mapping options
 * @returns {Object} Mapped column with resolved type
 */
function mapSingleColumn(
  column: any,
  context: MappingContext,
  options: MappingOptions,
): {
  name: string;
  tsType: string;
  chType: string;
  typeAst: TypeAst;
  comment?: string;
} {
  let resolvedType = column.type;
  let rawType = column.rawType;

  if (resolvedType.name === "Unknown") {
    const resolved = resolveUnknownType(column, context);
    if (resolved) {
      resolvedType = resolved.type;
      rawType = resolved.rawType;
    }
  }

  const chType = rawType.trim();
  const tsType = mapTypeAstToTs(resolvedType, options);

  return {
    name: options.camelCase ? toCamelCase(column.name) : column.name,
    tsType,
    chType,
    typeAst: resolvedType,
    comment: column.comment,
  };
}

/**
 * Resolve Unknown type through source tables and CTEs.
 * @param {any} column - Column with Unknown type
 * @param {MappingContext} context - Mapping context
 * @returns {Object | undefined} Resolved type info or undefined
 */
function resolveUnknownType(
  column: any,
  context: MappingContext,
): { type: TypeAst; rawType: string } | undefined {
  // Try source table resolution first
  if (context.sourceTable) {
    return resolveFromSourceTable(column, context);
  }

  // Try CTE resolution
  return resolveFromCTE(column, context);
}

/**
 * Resolve type from source table (materialized view case).
 * @param {any} column - Column to resolve
 * @param {MappingContext} context - Mapping context
 * @returns {Object | undefined} Resolved type info or undefined
 */
function resolveFromSourceTable(
  column: any,
  context: MappingContext,
): { type: TypeAst; rawType: string } | undefined {
  if (!context.sourceTable) return undefined;

  // Determine source column name (handle aliases)
  let sourceName = column.name;
  const aliasedName = context.aliasMap.get(column.name);
  if (aliasedName) sourceName = aliasedName;

  // Find source column
  const sourceColumn = findColumnByName(context.sourceTable, sourceName);
  if (sourceColumn) {
    return {
      type: sourceColumn.type,
      rawType: sourceColumn.rawType,
    };
  }

  return undefined;
}

/**
 * Resolve type from CTE (Common Table Expression).
 * @param {any} column - Column to resolve
 * @param {MappingContext} context - Mapping context
 * @returns {Object | undefined} Resolved type info or undefined
 */
function resolveFromCTE(
  column: any,
  context: MappingContext,
): { type: TypeAst; rawType: string } | undefined {
  const mvInfo = context.mvInfoMap.get(column.name);
  if (!mvInfo) {
    // No info: fallback to string
    return {
      type: { name: "String", args: [] },
      rawType: "String",
    };
  }

  const cteInfo = mvInfo.src ? context.cteAliasMap.get(mvInfo.src) : undefined;
  let baseType: TypeAst | undefined;

  if (cteInfo) {
    baseType = resolveCTEBaseType(cteInfo, context);
  }

  // Apply aggregate function resolution
  const resolvedType = resolveAggReturnType(mvInfo.func, baseType);
  if (resolvedType) {
    return {
      type: resolvedType,
      rawType: resolvedType.name,
    };
  }

  // Fallback for plain identifiers
  if (!mvInfo.func) {
    return {
      type: { name: "String", args: [] },
      rawType: "String",
    };
  }

  return undefined;
}

/**
 * Resolve base type from CTE information.
 * @param {Object} cteInfo - CTE information
 * @param {MappingContext} context - Mapping context
 * @returns {TypeAst | undefined} Base type or undefined
 */
function resolveCTEBaseType(
  cteInfo: { func?: string; src?: string },
  context: MappingContext,
): TypeAst | undefined {
  // Try function-based type mapping first
  if (cteInfo.func) {
    const funcType = mapFuncToType(cteInfo.func);
    if (funcType.name !== "Unknown") return funcType;
  }

  // Try source column lookup
  if (cteInfo.src && context.cteSourceTable) {
    const sourceColumn = findColumnByName(context.cteSourceTable, cteInfo.src);
    return sourceColumn?.type;
  }

  return undefined;
}

/** Maximum SELECT items to process for safety. */
const MAX_SELECT_ITEMS = 1000;

/** Maximum CTE columns to process for safety. */
const MAX_CTE_COLUMNS = 1000;

/**
 * Build alias mapping from SELECT items.
 * Maps column aliases to their source column names for type resolution.
 * @param {TableAst} table - Table with potential SELECT items
 * @returns {Map<string, string>} Map from alias to source name
 */
function buildAliasMap(table: TableAst): Map<string, string> {
  const aliasMap = new Map<string, string>();

  if (!table.mvSelect) return aliasMap;

  const itemCount = Math.min(table.mvSelect.length, MAX_SELECT_ITEMS);

  for (let i = 0; i < itemCount; i++) {
    const item = table.mvSelect[i];
    if (item && item.alias && item.alias.length > 0) {
      // Map alias to source column name (prefer srcName, fallback to name)
      const sourceName = item.srcName ?? item.name;
      aliasMap.set(item.alias, sourceName);
    }
  }

  return aliasMap;
}

/**
 * Build materialized view info mapping.
 * Maps column names to their function and source information.
 * @param {TableAst} table - Table with potential SELECT items
 * @returns {Map<string, Object>} Map from column name to function/source info
 */
function buildMvInfoMap(
  table: TableAst,
): Map<string, { func?: string; src?: string }> {
  const infoMap = new Map<string, { func?: string; src?: string }>();

  if (!table.mvSelect) return infoMap;

  const itemCount = Math.min(table.mvSelect.length, MAX_SELECT_ITEMS);

  for (let i = 0; i < itemCount; i++) {
    const item = table.mvSelect[i];
    if (item) {
      const key = item.alias ?? item.name;

      if (key && key.length > 0) {
        infoMap.set(key, {
          func: item.func,
          src: item.srcName,
        });
      }
    }
  }

  return infoMap;
}

/**
 * Build CTE alias mapping.
 * Maps CTE column names to their function and source information.
 * @param {TableAst} table - Table with potential CTE
 * @returns {Map<string, Object>} Map from CTE column to function/source info
 */
function buildCteAliasMap(
  table: TableAst,
): Map<string, { func?: string; src?: string }> {
  const cteMap = new Map<string, { func?: string; src?: string }>();

  if (!table.mvCte || !table.mvCte.columns) return cteMap;

  const columnCount = Math.min(table.mvCte.columns.length, MAX_CTE_COLUMNS);

  for (let i = 0; i < columnCount; i++) {
    const column = table.mvCte.columns[i];
    if (column) {
      const key = column.alias ?? column.name;

      if (key && key.length > 0) {
        cteMap.set(key, {
          func: column.func,
          src: column.srcName ?? column.name,
        });
      }
    }
  }

  return cteMap;
}

/**
 * Map function name to ClickHouse type.
 * Handles common ClickHouse conversion functions.
 * @param {string} funcName - Function name to map
 * @returns {TypeAst} Corresponding ClickHouse type
 */
function mapFuncToType(funcName: string): TypeAst {
  assert(typeof funcName === "string", "Function name must be string");
  assert(funcName.length > 0, "Function name cannot be empty");

  const normalizedFunc = funcName.toLowerCase().trim();

  // Handle conversion functions with predictable patterns
  if (normalizedFunc.startsWith("tofloat")) {
    return { name: "Float64", args: [] };
  }
  if (normalizedFunc.startsWith("toint")) {
    return { name: "Int64", args: [] };
  }
  if (normalizedFunc.startsWith("touint")) {
    return { name: "UInt64", args: [] };
  }
  if (normalizedFunc.startsWith("todecimal")) {
    return { name: "Decimal", args: [] };
  }
  if (normalizedFunc === "tostartofday") {
    return { name: "DateTime", args: [] };
  }

  return { name: "Unknown", args: [] };
}

/**
 * Resolve aggregate function return type.
 * Determines TypeScript type for ClickHouse aggregate functions with base type fallback.
 * @param {string | undefined} funcName - Aggregate function name
 * @param {TypeAst | undefined} baseType - Base column type for context
 * @returns {TypeAst | undefined} Resolved return type or undefined
 */
function resolveAggReturnType(
  funcName: string | undefined,
  baseType: TypeAst | undefined,
): TypeAst | undefined {
  if (!funcName) return baseType;

  assert(funcName.length > 0, "Function name cannot be empty");

  const normalizedFunc = funcName.toLowerCase().trim();

  // DateTime functions
  if (normalizedFunc === "tostartofday") {
    return { name: "DateTime", args: [] };
  }

  // Numeric aggregates always return Float64
  if (isNumericAggregate(normalizedFunc)) {
    return { name: "Float64", args: [] };
  }

  // State-preserving functions: preserve base type or default to Float64
  if (isStatePreservingAggregate(normalizedFunc)) {
    return baseType ?? { name: "Float64", args: [] };
  }

  // Default: preserve base type
  return baseType;
}

/**
 * Check if function is a numeric aggregate.
 * @param {string} funcName - Normalized function name
 * @returns {boolean} True if numeric aggregate
 */
function isNumericAggregate(funcName: string): boolean {
  return (
    /^sum/.test(funcName) || /^avg/.test(funcName) || /^count/.test(funcName)
  );
}

/**
 * Check if function preserves state/type.
 * @param {string} funcName - Normalized function name
 * @returns {boolean} True if state-preserving
 */
function isStatePreservingAggregate(funcName: string): boolean {
  return (
    /^anylast/.test(funcName) ||
    /^anystate/.test(funcName) ||
    /^max/.test(funcName) ||
    /^min/.test(funcName) ||
    /^argmin/.test(funcName) ||
    /^argmax/.test(funcName)
  );
}

/**
 * Find table by name with case-insensitive fallback.
 * @param {readonly TableAst[]} tables - Tables to search
 * @param {string} name - Table name to find
 * @returns {TableAst | undefined} Found table or undefined
 */
function findTableByName(
  tables: readonly TableAst[],
  name: string,
): TableAst | undefined {
  assert(typeof name === "string", "Table name must be string");
  assert(name.length > 0, "Table name cannot be empty");

  // Exact match first (most common case)
  const exactMatch = tables.find((table) => table.name === name);
  if (exactMatch) return exactMatch;

  // Case-insensitive fallback
  const normalizedName = toPascalCase(name);
  return tables.find((table) => toPascalCase(table.name) === normalizedName);
}

/**
 * Find column by name with case-insensitive fallback.
 * @param {TableAst} table - Table to search in
 * @param {string} name - Column name to find
 * @returns {any | undefined} Found column or undefined
 */
function findColumnByName(table: TableAst, name: string): any | undefined {
  assert(typeof name === "string", "Column name must be string");
  assert(name.length > 0, "Column name cannot be empty");

  // Exact match first (most common case)
  const exactMatch = table.columns.find((column) => column.name === name);
  if (exactMatch) return exactMatch;

  // Case-insensitive fallback
  const normalizedName = toCamelCase(name);
  return table.columns.find(
    (column) => toCamelCase(column.name) === normalizedName,
  );
}
