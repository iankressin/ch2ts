import {
  Project,
  QuoteKind,
  StructureKind,
  VariableDeclarationKind,
  IndentationText,
  type PropertySignatureStructure,
  type SourceFile,
} from "ts-morph";
import type {
  EmissionOptions,
  EnumMember,
  MappedTable,
  TypeAst,
  TypeArg,
} from "./types.js";
import {
  assert,
  firstTypeArg,
  secondTypeArg,
  toTypeOrUnknown,
} from "./ast-utils.js";

/** Maximum number of tables to emit for safety. */
const MAX_TABLES = 1000;

/** Maximum number of columns per table for safety. */
const MAX_COLUMNS = 1000;

/** Maximum Zod property entries for multiline threshold. */
const MAX_ONELINER_PROPS = 8;

/** Maximum line length for Zod oneliner threshold. */
const MAX_ONELINER_LENGTH = 120;

/** Maximum recursion depth for Zod schema generation. */
const MAX_ZOD_DEPTH = 20;

/** Maximum enum keys for Zod enum generation. */
const MAX_ENUM_KEYS = 1000;

/** Maximum tuple elements for Zod tuple generation. */
const MAX_TUPLE_ELEMENTS = 100;

/**
 * Context for TypeScript emission with bounded operations.
 */
interface EmissionContext {
  readonly project: Project;
  readonly sourceFile: SourceFile;
  readonly options: EmissionOptions;
  readonly dependencies: EmissionDependencies;
}

/**
 * Dependencies needed for emission based on table analysis.
 */
interface EmissionDependencies {
  readonly needsIPv4: boolean;
  readonly needsIPv6: boolean;
  readonly needsDecimal: boolean;
  readonly needsZod: boolean;
}

/**
 * Emit TypeScript source from mapped tables using ts-morph.
 * Generates TypeScript interfaces and optional Zod schemas with safety bounds and validation.
 * Uses explicit limits and fail-fast validation for safety.
 * @param {readonly MappedTable[]} mappedTables - Array of mapped table structures
 * @param {EmissionOptions} options - Emission configuration options
 * @returns {string} Generated TypeScript source code
 * @throws {Error} When input is invalid or exceeds safety limits
 */
export function emit(
  mappedTables: readonly MappedTable[],
  options: EmissionOptions,
): string {
  // Safety bounds and validation
  validateEmissionInput(mappedTables, options);

  // Create emission context
  const context = createEmissionContext(mappedTables, options);

  // Generate source file content
  generateSourceContent(context, mappedTables);

  return context.sourceFile.getFullText();
}

/**
 * Validate emission input with safety bounds.
 * @param {readonly MappedTable[]} tables - Tables to validate
 * @param {EmissionOptions} options - Options to validate
 * @throws {Error} When input is invalid or exceeds limits
 */
function validateEmissionInput(
  tables: readonly MappedTable[],
  options: EmissionOptions,
): void {
  assert(Array.isArray(tables), "emit expects an array of mapped tables");
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);
  assert(
    options !== null && typeof options === "object",
    "Options must be object",
  );
  assert(typeof options.emitZod === "boolean", "emitZod must be boolean");

  // Validate each table structure
  for (const table of tables) {
    validateTableForEmission(table);
  }
}

/**
 * Validate individual table for emission.
 * @param {MappedTable} table - Table to validate
 * @throws {Error} When table structure is invalid
 */
function validateTableForEmission(table: MappedTable): void {
  assert(table !== null && typeof table === "object", "Table must be object");
  assert(
    typeof table.interfaceName === "string",
    "Table interfaceName must be string",
  );
  assert(table.interfaceName.length > 0, "Table interfaceName cannot be empty");
  assert(Array.isArray(table.columns), "Table columns must be array");
  assert(
    table.columns.length <= MAX_COLUMNS,
    `Too many columns: ${table.columns.length}`,
  );

  // Validate each column
  for (const column of table.columns) {
    validateColumnForEmission(column);
  }
}

/**
 * Validate individual column for emission.
 * @param {any} column - Column to validate
 * @throws {Error} When column structure is invalid
 */
function validateColumnForEmission(column: any): void {
  assert(
    column !== null && typeof column === "object",
    "Column must be object",
  );
  assert(typeof column.name === "string", "Column name must be string");
  assert(column.name.length > 0, "Column name cannot be empty");
  assert(typeof column.tsType === "string", "Column tsType must be string");
  assert(typeof column.chType === "string", "Column chType must be string");
  assert(
    column.typeAst !== null && typeof column.typeAst === "object",
    "Column typeAst must be object",
  );
}

/**
 * Create emission context with project and dependencies.
 * @param {readonly MappedTable[]} tables - Tables to analyze for dependencies
 * @param {EmissionOptions} options - Emission options
 * @returns {EmissionContext} Configured emission context
 */
function createEmissionContext(
  tables: readonly MappedTable[],
  options: EmissionOptions,
): EmissionContext {
  const project = createTsMorphProject();
  const sourceFile = project.createSourceFile("types.ts", "", {
    overwrite: true,
  });
  const dependencies = analyzeDependencies(tables, options);

  return {
    project,
    sourceFile,
    options,
    dependencies,
  };
}

/**
 * Create ts-morph project with consistent configuration.
 * @returns {Project} Configured ts-morph project
 */
function createTsMorphProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Double,
      indentationText: IndentationText.TwoSpaces,
    },
  });
}

/**
 * Analyze tables to determine required dependencies.
 * @param {readonly MappedTable[]} tables - Tables to analyze
 * @param {EmissionOptions} options - Emission options
 * @returns {EmissionDependencies} Required dependencies
 */
function analyzeDependencies(
  tables: readonly MappedTable[],
  options: EmissionOptions,
): EmissionDependencies {
  const tableCount = Math.min(tables.length, MAX_TABLES);
  let needsIPv4 = false;
  let needsIPv6 = false;
  let needsDecimal = false;

  for (let i = 0; i < tableCount; i++) {
    const table = tables[i];
    if (table) {
      const columnCount = Math.min(table.columns.length, MAX_COLUMNS);
      for (let j = 0; j < columnCount; j++) {
        const column = table.columns[j];
        if (column) {
          if (column.tsType === "IPv4") needsIPv4 = true;
          if (column.tsType === "IPv6") needsIPv6 = true;
          if (column.tsType === "Decimal") needsDecimal = true;
        }
      }
    }
  }

  return {
    needsIPv4,
    needsIPv6,
    needsDecimal,
    needsZod: options.emitZod,
  };
}

/**
 * Generate complete source file content.
 * @param {EmissionContext} context - Emission context
 * @param {readonly MappedTable[]} tables - Tables to emit
 */
function generateSourceContent(
  context: EmissionContext,
  tables: readonly MappedTable[],
): void {
  addFileHeader(context);
  addImports(context);
  addTypeAliases(context);
  addTableInterfaces(context, tables);
}

/**
 * Add file header comment with generation info.
 * @param {EmissionContext} context - Emission context
 */
function addFileHeader(context: EmissionContext): void {
  const optionsJson = JSON.stringify(context.options);
  context.sourceFile.addStatements([
    `/*\n * Generated by @ch2ts/core\n * Options: ${optionsJson}\n */`,
  ]);
}

/**
 * Add required import declarations.
 * @param {EmissionContext} context - Emission context
 */
function addImports(context: EmissionContext): void {
  const { sourceFile, dependencies } = context;

  if (dependencies.needsZod) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "zod",
      namedImports: ["z"],
    });
  }

  if (dependencies.needsDecimal) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: "decimal.js",
      isTypeOnly: true,
      namedImports: ["Decimal"],
    });
  }
}

/**
 * Add branded type aliases for special types.
 * @param {EmissionContext} context - Emission context
 */
function addTypeAliases(context: EmissionContext): void {
  const { sourceFile, dependencies } = context;

  if (dependencies.needsIPv4) {
    sourceFile.addTypeAlias({
      isExported: true,
      name: "IPv4",
      type: `string & { readonly __brand: 'IPv4' }`,
    });
  }

  if (dependencies.needsIPv6) {
    sourceFile.addTypeAlias({
      isExported: true,
      name: "IPv6",
      type: `string & { readonly __brand: 'IPv6' }`,
    });
  }
}

/**
 * Add TypeScript interfaces and Zod schemas for all tables.
 * @param {EmissionContext} context - Emission context
 * @param {readonly MappedTable[]} tables - Tables to emit
 */
function addTableInterfaces(
  context: EmissionContext,
  tables: readonly MappedTable[],
): void {
  const tableCount = Math.min(tables.length, MAX_TABLES);

  for (let i = 0; i < tableCount; i++) {
    const table = tables[i];
    if (table) {
      addSingleTableInterface(context, table);

      if (context.dependencies.needsZod) {
        addSingleTableZodSchema(context, table);
      }
    }
  }
}

/**
 * Add TypeScript interface for a single table.
 * @param {EmissionContext} context - Emission context
 * @param {MappedTable} table - Table to emit interface for
 */
function addSingleTableInterface(
  context: EmissionContext,
  table: MappedTable,
): void {
  const properties = createInterfaceProperties(table);

  context.sourceFile.addInterface({
    isExported: true,
    name: table.interfaceName,
    properties,
  });
}

/**
 * Create property signatures for interface.
 * @param {MappedTable} table - Table to create properties for
 * @returns {PropertySignatureStructure[]} Array of property signatures
 */
function createInterfaceProperties(
  table: MappedTable,
): PropertySignatureStructure[] {
  const properties: PropertySignatureStructure[] = [];
  const columnCount = Math.min(table.columns.length, MAX_COLUMNS);

  for (let i = 0; i < columnCount; i++) {
    const column = table.columns[i];
    if (column) {
      properties.push({
        kind: StructureKind.PropertySignature,
        name: column.name,
        type: column.tsType,
        docs: [createPropertyDocumentation(column)],
        hasQuestionToken: false,
      });
    }
  }

  return properties;
}

/**
 * Create JSDoc documentation for property.
 * @param {any} column - Column to create docs for
 * @returns {string} Documentation string
 */
function createPropertyDocumentation(column: any): string {
  const baseDoc = `Original: ${column.chType}`;
  return column.comment ? `${baseDoc} — ${column.comment}` : baseDoc;
}

/**
 * Add Zod schema for a single table.
 * @param {EmissionContext} context - Emission context
 * @param {MappedTable} table - Table to emit schema for
 */
function addSingleTableZodSchema(
  context: EmissionContext,
  table: MappedTable,
): void {
  const zodEntries = createZodPropertyEntries(table);
  const initializer = formatZodInitializer(zodEntries);

  context.sourceFile.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `${table.interfaceName}Schema`,
        initializer,
      },
    ],
  });
}

/**
 * Create Zod property entries for table columns.
 * @param {MappedTable} table - Table to create entries for
 * @returns {string[]} Array of Zod property entry strings
 */
function createZodPropertyEntries(table: MappedTable): string[] {
  const entries: string[] = [];
  const columnCount = Math.min(table.columns.length, MAX_COLUMNS);

  for (let i = 0; i < columnCount; i++) {
    const column = table.columns[i];
    if (column) {
      const zodType = zodForTypeAst(column.typeAst, column.tsType, 0);
      entries.push(`${column.name}: ${zodType}`);
    }
  }

  return entries;
}

/**
 * Format Zod initializer as oneliner or multiline.
 * @param {string[]} entries - Zod property entries
 * @returns {string} Formatted initializer string
 */
function formatZodInitializer(entries: string[]): string {
  const oneLiner = `z.object({ ${entries.join(", ")} })`;
  const shouldMultiline =
    entries.length > MAX_ONELINER_PROPS ||
    oneLiner.length > MAX_ONELINER_LENGTH;

  if (!shouldMultiline) {
    return oneLiner;
  }

  return [
    "z.object({",
    ...entries.map((entry: string) => `  ${entry},`),
    "})",
  ].join("\n");
}

/**
 * Generate Zod schema string from ClickHouse TypeAst.
 * Maps ClickHouse types to appropriate Zod validators with bounded recursion.
 * Uses explicit depth tracking and limits for safety.
 * @param {TypeAst} type - ClickHouse type AST to convert
 * @param {string} resolvedTsType - Resolved TypeScript type for context
 * @param {number} [depth=0] - Current recursion depth for safety bounds
 * @returns {string} Zod schema expression string
 * @throws {Error} When recursion depth exceeded or type is invalid
 */
function zodForTypeAst(
  type: TypeAst,
  resolvedTsType: string,
  depth = 0,
): string {
  // Safety bounds
  if (depth > MAX_ZOD_DEPTH) {
    throw new Error(`Zod schema generation depth exceeded ${MAX_ZOD_DEPTH}`);
  }

  // Validate inputs
  validateZodTypeInput(type, resolvedTsType);

  // Central control flow with delegated handlers
  return mapTypeToZodSchema(type, resolvedTsType, depth);
}

/**
 * Validate Zod type conversion inputs.
 * @param {TypeAst} type - Type to validate
 * @param {string} resolvedTsType - TypeScript type to validate
 * @throws {Error} When inputs are invalid
 */
function validateZodTypeInput(type: TypeAst, resolvedTsType: string): void {
  assert(type !== null && typeof type === "object", "Type must be object");
  assert(typeof type.name === "string", "Type name must be string");
  assert(type.name.length > 0, "Type name cannot be empty");
  assert(Array.isArray(type.args), "Type args must be array");
  assert(
    typeof resolvedTsType === "string",
    "Resolved TypeScript type must be string",
  );
}

/**
 * Map ClickHouse type to Zod schema with central control flow.
 * Delegates to specialized handlers for each type category.
 * @param {TypeAst} type - Type to map
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Zod schema expression
 */
function mapTypeToZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const typeName = type.name;

  switch (typeName) {
    case "Nullable":
      return mapNullableZodSchema(type, resolvedTsType, depth);
    case "LowCardinality":
      return mapLowCardinalityZodSchema(type, resolvedTsType, depth);
    case "Array":
      return mapArrayZodSchema(type, resolvedTsType, depth);
    case "Tuple":
      return mapTupleZodSchema(type, resolvedTsType, depth);
    case "Map":
      return mapMapZodSchema(type, resolvedTsType, depth);
    case "Enum8":
    case "Enum16":
      return mapEnumZodSchema(type);
    case "Decimal":
      return createStringZodSchema();
    case "Float32":
    case "Float64":
    case "Int8":
    case "Int16":
    case "Int32":
    case "UInt8":
    case "UInt16":
    case "UInt32":
      return createNumberZodSchema();
    case "Int64":
    case "UInt64":
      return mapBigIntZodSchema(resolvedTsType);
    case "String":
    case "UUID":
    case "FixedString":
    case "IPv4":
    case "IPv6":
      return createStringZodSchema();
    case "Date":
    case "DateTime":
    case "DateTime64":
      return mapDateTimeZodSchema(resolvedTsType);
    default:
      return createAnyZodSchema();
  }
}

/**
 * Map Nullable(T) to Zod nullable schema.
 * @param {TypeAst} type - Nullable type
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Zod nullable schema expression
 */
function mapNullableZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  const innerSchema = zodForTypeAst(inner, resolvedTsType, depth + 1);
  return `${innerSchema}.nullable()`;
}

/**
 * Map LowCardinality(T) to inner Zod schema (no-op wrapper).
 * @param {TypeAst} type - LowCardinality type
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Inner type Zod schema
 */
function mapLowCardinalityZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  return zodForTypeAst(inner, resolvedTsType, depth + 1);
}

/**
 * Map Array(T) to Zod array schema.
 * @param {TypeAst} type - Array type
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Zod array schema expression
 */
function mapArrayZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const inner = firstTypeArg(type);
  const innerSchema = zodForTypeAst(inner, resolvedTsType, depth + 1);
  return `z.array(${innerSchema})`;
}

/**
 * Map Tuple(T1,T2,...) to Zod object schema with indexed properties.
 * @param {TypeAst} type - Tuple type
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Zod object schema with tuple properties
 */
function mapTupleZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const entries: string[] = [];
  const elementCount = Math.min(type.args.length, MAX_TUPLE_ELEMENTS);

  for (let i = 0; i < elementCount; i++) {
    const arg = type.args[i];
    const argType = toTypeOrUnknown(arg);
    const argSchema = zodForTypeAst(argType, resolvedTsType, depth + 1);
    entries.push(`_${i}: ${argSchema}`);
  }

  return `z.object({ ${entries.join(", ")} })`;
}

/**
 * Map Map(K,V) to Zod record schema.
 * @param {TypeAst} type - Map type
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @param {number} depth - Current recursion depth
 * @returns {string} Zod record schema expression
 */
function mapMapZodSchema(
  type: TypeAst,
  resolvedTsType: string,
  depth: number,
): string {
  const valueType = secondTypeArg(type);
  const valueSchema = zodForTypeAst(valueType, resolvedTsType, depth + 1);
  return `z.record(z.string(), ${valueSchema})`;
}

/**
 * Map Enum8/Enum16 to Zod enum schema.
 * @param {TypeAst} type - Enum type
 * @returns {string} Zod enum or string schema expression
 */
function mapEnumZodSchema(type: TypeAst): string {
  const keys = extractEnumKeysForZod(type.args);

  if (keys.length === 0) {
    return createStringZodSchema();
  }

  const quotedKeys = keys.map(escapeZodEnumKey);
  const arrayLiteral = `[${quotedKeys.join(", ")}]`;
  return `z.enum(${arrayLiteral})`;
}

/**
 * Extract enum keys from type arguments with safety bounds.
 * @param {readonly TypeArg[]} args - Type arguments
 * @returns {string[]} Array of enum key strings
 */
function extractEnumKeysForZod(args: readonly TypeArg[]): string[] {
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
 * Escape enum key for Zod enum literal.
 * @param {string} key - Enum key to escape
 * @returns {string} Escaped key with quotes
 */
function escapeZodEnumKey(key: string): string {
  const escaped = key.replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/**
 * Map Int64/UInt64 based on resolved TypeScript type.
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @returns {string} Zod bigint or string schema
 */
function mapBigIntZodSchema(resolvedTsType: string): string {
  return /\bbigint\b/.test(resolvedTsType) ? "z.bigint()" : "z.string()";
}

/**
 * Map DateTime types based on resolved TypeScript type.
 * @param {string} resolvedTsType - Resolved TypeScript type
 * @returns {string} Zod date or string schema
 */
function mapDateTimeZodSchema(resolvedTsType: string): string {
  return /\bDate\b/.test(resolvedTsType) ? "z.date()" : "z.string()";
}

/**
 * Create basic Zod string schema.
 * @returns {string} Zod string schema expression
 */
function createStringZodSchema(): string {
  return "z.string()";
}

/**
 * Create basic Zod number schema.
 * @returns {string} Zod number schema expression
 */
function createNumberZodSchema(): string {
  return "z.number()";
}

/**
 * Create Zod any schema for unknown types.
 * @returns {string} Zod any schema expression
 */
function createAnyZodSchema(): string {
  return "z.any()";
}

// helpers moved to ast-utils.ts
