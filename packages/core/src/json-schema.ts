import type { MappedTable, TypeAst, TypeArg, EnumMember } from "./types.js";
import {
  assert,
  firstTypeArg,
  secondTypeArg,
  toTypeOrUnknown,
} from "./ast-utils.js";

/** Maximum number of tables to process for safety. */
const MAX_TABLES = 100;

/** Maximum number of columns per table for safety. */
const MAX_COLUMNS = 1000;

/** Maximum recursion depth for schema generation safety. */
const MAX_SCHEMA_DEPTH = 20;

/** Maximum tuple elements to process for safety. */
const MAX_TUPLE_ELEMENTS = 100;

/** Maximum enum keys to process for safety. */
const MAX_ENUM_KEYS = 1000;

/**
 * Emit a single JSON Schema for the first table.
 * Generates JSON Schema draft 2020-12 compatible schema with type validation and bounds checking.
 * Uses explicit limits and fail-fast validation for safety.
 * @param {readonly MappedTable[]} mappedTables - Array of mapped table structures
 * @returns {string} JSON Schema as formatted string
 * @throws {Error} When input is invalid or exceeds safety limits
 */
export function emitJsonSchema(mappedTables: readonly MappedTable[]): string {
  // Safety bounds and validation
  validateMappedTablesInput(mappedTables);

  // Handle empty input
  if (mappedTables.length === 0) {
    return createEmptySchema();
  }

  // Process first table only (basic support)
  const table = mappedTables[0]!;
  validateTableStructure(table);

  return generateTableSchema(table);
}

/**
 * Validate mapped tables input with safety bounds.
 * @param {readonly MappedTable[]} tables - Tables to validate
 * @throws {Error} When input is invalid or exceeds limits
 */
function validateMappedTablesInput(tables: readonly MappedTable[]): void {
  assert(Array.isArray(tables), "Input must be an array of MappedTable");
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);
}

/**
 * Validate individual table structure.
 * @param {MappedTable} table - Table to validate
 * @throws {Error} When table structure is invalid
 */
function validateTableStructure(table: MappedTable): void {
  assert(
    table !== null && typeof table === "object",
    "Table must be an object",
  );
  assert(
    typeof table.interfaceName === "string",
    "Table interfaceName must be string",
  );
  assert(table.interfaceName.length > 0, "Table interfaceName cannot be empty");
  assert(Array.isArray(table.columns), "Table columns must be an array");
  assert(
    table.columns.length <= MAX_COLUMNS,
    `Too many columns: ${table.columns.length}`,
  );

  // Validate each column
  for (const column of table.columns) {
    validateColumnStructure(column);
  }
}

/**
 * Validate individual column structure.
 * @param {any} column - Column to validate
 * @throws {Error} When column structure is invalid
 */
function validateColumnStructure(column: any): void {
  assert(
    column !== null && typeof column === "object",
    "Column must be an object",
  );
  assert(typeof column.name === "string", "Column name must be string");
  assert(column.name.length > 0, "Column name cannot be empty");
  assert(typeof column.tsType === "string", "Column tsType must be string");
  assert(
    column.typeAst !== null && typeof column.typeAst === "object",
    "Column typeAst must be object",
  );
}

/**
 * Create empty JSON Schema.
 * @returns {string} Empty schema as JSON string
 */
function createEmptySchema(): string {
  return JSON.stringify({}, null, 2);
}

/**
 * Generate JSON Schema for a table.
 * Creates complete schema with properties, required fields, and validation rules.
 * @param {MappedTable} table - Table to generate schema for
 * @returns {string} Complete JSON Schema as formatted string
 */
function generateTableSchema(table: MappedTable): string {
  const schema = createBaseSchema(table);
  const properties = generateColumnProperties([...table.columns]); // Convert readonly to mutable
  const requiredFields = extractRequiredFields([...table.columns]); // Convert readonly to mutable

  const completeSchema = {
    ...schema,
    properties,
    additionalProperties: false,
    required: requiredFields,
  };

  return formatJsonSchema(completeSchema);
}

/**
 * Format JSON Schema with custom formatting for required array.
 * Ensures required array is formatted inline for consistency with golden files.
 * @param {any} schema - Schema object to format
 * @returns {string} Formatted JSON string
 */
function formatJsonSchema(schema: any): string {
  const jsonString = JSON.stringify(schema, null, 2);
  
  // Replace multiline required array with inline format
  return jsonString.replace(
    /"required":\s*\[\s*([^[\]]*?)\s*\]/gs,
    (match, content) => {
      // Extract individual items and clean them up
      const items = content
        .split(',')
        .map((item: string) => item.trim())
        .filter((item: string) => item.length > 0);
      
      // Format as inline array
      return `"required": [${items.join(', ')}]`;
    }
  );
}

/**
 * Create base schema structure.
 * @param {MappedTable} table - Table for schema metadata
 * @returns {Object} Base schema object
 */
function createBaseSchema(table: MappedTable): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: table.interfaceName,
    type: "object",
  };
}

/**
 * Generate properties for all columns with bounded processing.
 * @param {Array} columns - Table columns
 * @returns {Record<string, unknown>} Properties object
 */
function generateColumnProperties(columns: any[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const columnCount = Math.min(columns.length, MAX_COLUMNS);

  for (let i = 0; i < columnCount; i++) {
    const column = columns[i];
    if (column && column.name) {
      properties[column.name] = jsonSchemaForType(
        column.typeAst,
        column.tsType,
        0,
      );
    }
  }

  return properties;
}

/**
 * Extract required field names from columns.
 * @param {Array} columns - Table columns
 * @returns {string[]} Array of required field names
 */
function extractRequiredFields(columns: any[]): string[] {
  const required: string[] = [];
  const columnCount = Math.min(columns.length, MAX_COLUMNS);

  for (let i = 0; i < columnCount; i++) {
    const column = columns[i];
    if (column && column.name && typeof column.name === "string") {
      required.push(column.name);
    }
  }

  return required;
}

/**
 * Convert ClickHouse TypeAst to JSON Schema definition.
 * Handles complex types with bounded recursion and explicit limits for safety.
 * Maps ClickHouse types to JSON Schema types with appropriate validation rules.
 * @param {TypeAst} type - ClickHouse type AST to convert
 * @param {string} resolvedTs - Resolved TypeScript type for context
 * @param {number} [depth=0] - Current recursion depth for safety bounds
 * @returns {Record<string, unknown>} JSON Schema definition object
 * @throws {Error} When recursion depth exceeded or type is invalid
 */
function jsonSchemaForType(
  type: TypeAst,
  resolvedTs: string,
  depth = 0,
): Record<string, unknown> {
  // Safety bounds
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new Error(
      `JSON Schema generation depth exceeded ${MAX_SCHEMA_DEPTH}`,
    );
  }

  // Validate inputs
  validateTypeInput(type, resolvedTs);

  // Central control flow with delegated handlers
  return mapTypeToJsonSchema(type, resolvedTs, depth);
}

/**
 * Validate type conversion inputs.
 * @param {TypeAst} type - Type to validate
 * @param {string} resolvedTs - TypeScript type to validate
 * @throws {Error} When inputs are invalid
 */
function validateTypeInput(type: TypeAst, resolvedTs: string): void {
  assert(type !== null && typeof type === "object", "Type must be object");
  assert(typeof type.name === "string", "Type name must be string");
  assert(type.name.length > 0, "Type name cannot be empty");
  assert(Array.isArray(type.args), "Type args must be array");
  assert(
    typeof resolvedTs === "string",
    "Resolved TypeScript type must be string",
  );
}

/**
 * Map ClickHouse type to JSON Schema with central control flow.
 * Delegates to specialized handlers for each type category.
 * @param {TypeAst} type - Type to map
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} JSON Schema definition
 */
function mapTypeToJsonSchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const typeName = type.name;

  switch (typeName) {
    case "Nullable":
      return mapNullableSchema(type, resolvedTs, depth);
    case "LowCardinality":
      return mapLowCardinalitySchema(type, resolvedTs, depth);
    case "Array":
      return mapArraySchema(type, resolvedTs, depth);
    case "Tuple":
      return mapTupleSchema(type, resolvedTs, depth);
    case "Map":
      return mapMapSchema(type, resolvedTs, depth);
    case "Enum8":
    case "Enum16":
      return mapEnumSchema(type);
    case "Decimal":
      return createStringSchema();
    case "Float32":
    case "Float64":
    case "Int8":
    case "Int16":
    case "Int32":
    case "UInt8":
    case "UInt16":
    case "UInt32":
      return createNumberSchema();
    case "Int64":
    case "UInt64":
      return mapBigIntSchema(resolvedTs);
    case "String":
    case "UUID":
    case "FixedString":
    case "IPv4":
    case "IPv6":
      return createStringSchema();
    case "Date":
    case "DateTime":
    case "DateTime64":
      return mapDateTimeSchema(resolvedTs);
    default:
      return createUnknownSchema();
  }
}

/**
 * Map Nullable(T) to anyOf schema with null option.
 * @param {TypeAst} type - Nullable type
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} anyOf schema definition
 */
function mapNullableSchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const inner = firstTypeArg(type);
  const innerSchema = jsonSchemaForType(inner, resolvedTs, depth + 1);
  return {
    anyOf: [innerSchema, { type: "null" }],
  };
}

/**
 * Map LowCardinality(T) to inner type (no-op wrapper).
 * @param {TypeAst} type - LowCardinality type
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} Inner type schema
 */
function mapLowCardinalitySchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const inner = firstTypeArg(type);
  return jsonSchemaForType(inner, resolvedTs, depth + 1);
}

/**
 * Map Array(T) to array schema with items.
 * @param {TypeAst} type - Array type
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} Array schema definition
 */
function mapArraySchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const inner = firstTypeArg(type);
  const itemsSchema = jsonSchemaForType(inner, resolvedTs, depth + 1);
  return {
    type: "array",
    items: itemsSchema,
  };
}

/**
 * Map Tuple(T1,T2,...) to object schema with indexed properties.
 * @param {TypeAst} type - Tuple type
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} Object schema with tuple properties
 */
function mapTupleSchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const elementCount = Math.min(type.args.length, MAX_TUPLE_ELEMENTS);

  for (let i = 0; i < elementCount; i++) {
    const arg = type.args[i];
    const argType = toTypeOrUnknown(arg);
    properties[`_${i}`] = jsonSchemaForType(argType, resolvedTs, depth + 1);
  }

  return {
    type: "object",
    properties,
    additionalProperties: false,
  };
}

/**
 * Map Map(K,V) to object schema with additionalProperties.
 * @param {TypeAst} type - Map type
 * @param {string} resolvedTs - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {Record<string, unknown>} Object schema with dynamic properties
 */
function mapMapSchema(
  type: TypeAst,
  resolvedTs: string,
  depth: number,
): Record<string, unknown> {
  const valueType = secondTypeArg(type);
  const valueSchema = jsonSchemaForType(valueType, resolvedTs, depth + 1);
  return {
    type: "object",
    additionalProperties: valueSchema,
  };
}

/**
 * Map Enum8/Enum16 to string schema with enum constraint.
 * @param {TypeAst} type - Enum type
 * @returns {Record<string, unknown>} String schema with enum values
 */
function mapEnumSchema(type: TypeAst): Record<string, unknown> {
  const keys = extractEnumKeysForSchema(type.args);

  if (keys.length === 0) {
    return createStringSchema();
  }

  return {
    type: "string",
    enum: keys,
  };
}

/**
 * Extract enum keys from type arguments with safety bounds.
 * @param {readonly TypeArg[]} args - Type arguments
 * @returns {string[]} Array of enum key strings
 */
function extractEnumKeysForSchema(args: readonly TypeArg[]): string[] {
  const keys: string[] = [];
  const keyCount = Math.min(args.length, MAX_ENUM_KEYS);

  for (let i = 0; i < keyCount; i++) {
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
 * Map Int64/UInt64 based on resolved TypeScript type.
 * @param {string} resolvedTs - Resolved TypeScript type
 * @returns {Record<string, unknown>} Integer or string schema
 */
function mapBigIntSchema(resolvedTs: string): Record<string, unknown> {
  return /\bbigint\b/.test(resolvedTs)
    ? { type: "integer" }
    : { type: "string" };
}

/**
 * Map DateTime types based on resolved TypeScript type.
 * @param {string} resolvedTs - Resolved TypeScript type
 * @returns {Record<string, unknown>} String schema with optional date-time format
 */
function mapDateTimeSchema(resolvedTs: string): Record<string, unknown> {
  return /\bDate\b/.test(resolvedTs)
    ? { type: "string", format: "date-time" }
    : { type: "string" };
}

/**
 * Create basic string schema.
 * @returns {Record<string, unknown>} String type schema
 */
function createStringSchema(): Record<string, unknown> {
  return { type: "string" };
}

/**
 * Create basic number schema.
 * @returns {Record<string, unknown>} Number type schema
 */
function createNumberSchema(): Record<string, unknown> {
  return { type: "number" };
}

/**
 * Create empty schema for unknown types.
 * @returns {Record<string, unknown>} Empty schema object
 */
function createUnknownSchema(): Record<string, unknown> {
  return {};
}
