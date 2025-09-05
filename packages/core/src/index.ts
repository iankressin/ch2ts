export {
  TypeAst,
  TypeArg,
  EnumMember,
  ColumnAst,
  TableAst,
  MappingOptions,
  EmissionOptions,
  MappedTable,
} from "./types.js";
import type {
  TableAst,
  MappingOptions,
  EmissionOptions,
  MappedTable,
} from "./types.js";
import { parse as _parse } from "./parser.js";
import { map as _map } from "./mapping.js";
import { emit as _emit } from "./emitter.js";
import { emitJsonSchema as _emitJsonSchema } from "./json-schema.js";
import { assert } from "./ast-utils.js";

/** Maximum DDL input length for safety. */
const MAX_DDL_LENGTH = 10_000_000; // 10MB

/** Maximum number of statements to process for safety. */
const MAX_STATEMENTS = 1000;

/** Maximum length of single statement for safety. */
const MAX_STATEMENT_LENGTH = 100_000; // 100KB

/** Maximum number of tables to parse for safety. */
const MAX_TABLES = 1000;

/** Maximum statement head length for pattern matching. */
const MAX_HEAD_LENGTH = 200;

/**
 * Parse ClickHouse DDL into table AST array with safety bounds.
 * Filters and splits DDL statements, then parses each valid CREATE statement.
 * Uses explicit limits and error recovery for robust processing.
 * @param {string} ddl - Raw DDL string to parse
 * @returns {readonly TableAst[]} Array of parsed table AST nodes
 * @throws {Error} When DDL is invalid or exceeds safety limits
 */
export function parse(ddl: string): readonly TableAst[] {
  validateDdlInput(ddl);

  const filteredDdl = filterStatements(ddl);
  const statements = splitStatements(filteredDdl);

  if (statements.length === 0) {
    return [] as const;
  }

  return parseStatements(statements);
}

/**
 * Re-export mapTypeAstToTs for external use.
 * Provides direct access to type mapping functionality.
 */
export { mapTypeAstToTs } from "./mapping.js";

/**
 * Map parsed tables to TypeScript-compatible structures.
 * Applies type mapping rules and naming conventions with validation.
 * @param {readonly TableAst[]} tables - Parsed table AST array
 * @param {MappingOptions} options - Mapping configuration options
 * @returns {readonly MappedTable[]} Array of mapped table structures
 * @throws {Error} When input is invalid or mapping fails
 */
export function map(
  tables: readonly TableAst[],
  options: MappingOptions,
): readonly MappedTable[] {
  validateMapInput(tables, options);
  return _map(tables, options);
}

/**
 * Emit TypeScript source code from mapped tables.
 * Generates TypeScript interfaces and optional Zod schemas with validation.
 * @param {readonly MappedTable[]} mappedTables - Mapped table structures
 * @param {EmissionOptions} options - Emission configuration options
 * @returns {string} Generated TypeScript source code
 * @throws {Error} When input is invalid or emission fails
 */
export function emit(
  mappedTables: readonly MappedTable[],
  options: EmissionOptions,
): string {
  validateEmitInput(mappedTables, options);
  return _emit(mappedTables, options);
}

/**
 * Emit JSON Schema from mapped tables.
 * Generates JSON Schema definitions for table structures with validation.
 * @param {readonly MappedTable[]} mappedTables - Mapped table structures
 * @returns {string} Generated JSON Schema as string
 * @throws {Error} When input is invalid or schema generation fails
 */
export function emitJsonSchema(mappedTables: readonly MappedTable[]): string {
  validateJsonSchemaInput(mappedTables);
  return _emitJsonSchema(mappedTables);
}

/**
 * Generate complete TypeScript source from DDL in single operation.
 * Orchestrates parse → map → emit pipeline with comprehensive validation.
 * @param {string} ddl - Raw DDL string to process
 * @param {MappingOptions} mappingOptions - Type mapping configuration
 * @param {EmissionOptions} emissionOptions - Code emission configuration
 * @returns {string} Generated TypeScript source code
 * @throws {Error} When any pipeline stage fails
 */
export function generateSource(
  ddl: string,
  mappingOptions: MappingOptions,
  emissionOptions: EmissionOptions,
): string {
  validateGenerateSourceInput(ddl, mappingOptions, emissionOptions);

  const ast = parse(ddl);
  const mapped = map(ast, mappingOptions);
  return emit(mapped, emissionOptions);
}

/**
 * Validate DDL input for parsing.
 * @param {string} ddl - DDL string to validate
 * @throws {Error} When DDL is invalid or exceeds limits
 */
function validateDdlInput(ddl: string): void {
  assert(typeof ddl === "string", "DDL must be a string");
  assert(ddl.length <= MAX_DDL_LENGTH, `DDL too long: ${ddl.length} chars`);
}

/**
 * Validate input for map function.
 * @param {readonly TableAst[]} tables - Tables to validate
 * @param {MappingOptions} options - Options to validate
 * @throws {Error} When input is invalid
 */
function validateMapInput(
  tables: readonly TableAst[],
  options: MappingOptions,
): void {
  assert(Array.isArray(tables), "Tables must be array");
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);
  assert(
    options !== null && typeof options === "object",
    "Options must be object",
  );
}

/**
 * Validate input for emit function.
 * @param {readonly MappedTable[]} tables - Mapped tables to validate
 * @param {EmissionOptions} options - Options to validate
 * @throws {Error} When input is invalid
 */
function validateEmitInput(
  tables: readonly MappedTable[],
  options: EmissionOptions,
): void {
  assert(Array.isArray(tables), "Mapped tables must be array");
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);
  assert(
    options !== null && typeof options === "object",
    "Options must be object",
  );
  assert(typeof options.emitZod === "boolean", "emitZod must be boolean");
}

/**
 * Validate input for JSON schema emission.
 * @param {readonly MappedTable[]} tables - Mapped tables to validate
 * @throws {Error} When input is invalid
 */
function validateJsonSchemaInput(tables: readonly MappedTable[]): void {
  assert(Array.isArray(tables), "Mapped tables must be array");
  assert(tables.length <= MAX_TABLES, `Too many tables: ${tables.length}`);
}

/**
 * Validate input for generateSource function.
 * @param {string} ddl - DDL to validate
 * @param {MappingOptions} mappingOptions - Mapping options to validate
 * @param {EmissionOptions} emissionOptions - Emission options to validate
 * @throws {Error} When input is invalid
 */
function validateGenerateSourceInput(
  ddl: string,
  mappingOptions: MappingOptions,
  emissionOptions: EmissionOptions,
): void {
  validateDdlInput(ddl);
  assert(
    mappingOptions !== null && typeof mappingOptions === "object",
    "Mapping options must be object",
  );
  assert(
    emissionOptions !== null && typeof emissionOptions === "object",
    "Emission options must be object",
  );
  assert(
    typeof emissionOptions.emitZod === "boolean",
    "emitZod must be boolean",
  );
}

/**
 * Parse array of DDL statements with error recovery.
 * Processes each statement individually, skipping failures to continue parsing.
 * @param {string[]} statements - Array of DDL statements to parse
 * @returns {readonly TableAst[]} Array of successfully parsed tables
 */
function parseStatements(statements: string[]): readonly TableAst[] {
  const tables: TableAst[] = [];
  const statementCount = Math.min(statements.length, MAX_STATEMENTS);

  for (let i = 0; i < statementCount; i++) {
    const statement = statements[i];
    if (statement && statement.length <= MAX_STATEMENT_LENGTH) {
      try {
        const parsedTables = _parse(statement);
        if (parsedTables.length > 0) {
          tables.push(...parsedTables);
        }
      } catch {
        // Skip statements we can't parse (e.g., complex views)
        // Error recovery: continue processing remaining statements
        continue;
      }
    }
  }

  return tables;
}

/**
 * Filter DDL input to keep only parseable CREATE statements.
 * Removes unsupported statement types and routing materialized views.
 * Uses bounded string operations for safety.
 * @param {string} input - Raw DDL input string
 * @returns {string} Filtered DDL with only supported statements
 */
function filterStatements(input: string): string {
  const parts = splitDdlBysemicolon(input);
  const filteredParts = filterSupportedStatements(parts);

  return filteredParts.length > 0 ? filteredParts.join(";\n") + ";" : "";
}

/**
 * Split DDL input by semicolon with bounds checking.
 * @param {string} input - DDL input to split
 * @returns {string[]} Array of statement parts
 */
function splitDdlBysemicolon(input: string): string[] {
  return input
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Filter statement parts to keep only supported types.
 * @param {string[]} parts - Statement parts to filter
 * @returns {string[]} Array of supported statements
 */
function filterSupportedStatements(parts: string[]): string[] {
  const kept: string[] = [];
  const partCount = Math.min(parts.length, MAX_STATEMENTS);

  for (let i = 0; i < partCount; i++) {
    const statement = parts[i];
    if (statement && shouldKeepStatement(statement)) {
      kept.push(statement);
    }
  }

  return kept;
}

/**
 * Determine if statement should be kept for parsing.
 * @param {string} statement - Statement to evaluate
 * @returns {boolean} True if statement should be parsed
 */
function shouldKeepStatement(statement: string): boolean {
  const head = extractStatementHead(statement);

  // Skip regular views entirely
  if (isRegularView(head)) {
    return false;
  }

  // Handle materialized views with routing
  if (isMaterializedView(head)) {
    return !isRoutingMaterializedView(statement);
  }

  return true;
}

/**
 * Extract statement head for pattern matching with bounds.
 * @param {string} statement - Statement to extract head from
 * @returns {string} Lowercased statement head
 */
function extractStatementHead(statement: string): string {
  const headLength = Math.min(statement.length, MAX_HEAD_LENGTH);
  return statement.slice(0, headLength).toLowerCase();
}

/**
 * Check if statement is a regular view.
 * @param {string} head - Statement head to check
 * @returns {boolean} True if regular view
 */
function isRegularView(head: string): boolean {
  return /^create\s+view/.test(head);
}

/**
 * Check if statement is a materialized view.
 * @param {string} head - Statement head to check
 * @returns {boolean} True if materialized view
 */
function isMaterializedView(head: string): boolean {
  return /^create\s+materialized\s+view/.test(head);
}

/**
 * Check if materialized view has routing (TO or FOR clause).
 * @param {string} statement - Full statement to check
 * @returns {boolean} True if has routing clauses
 */
function isRoutingMaterializedView(statement: string): boolean {
  const lowerStatement = statement.toLowerCase();
  return (
    /(\s|\))to\s+/.test(lowerStatement) || /(\s|\))for\s+/.test(lowerStatement)
  );
}

/**
 * Split filtered DDL into individual statements.
 * Adds semicolon to each statement and filters empty ones.
 * @param {string} input - Filtered DDL input
 * @returns {string[]} Array of individual statements
 */
function splitStatements(input: string): string[] {
  return input
    .split(/;/)
    .map(trimStatement)
    .filter(isNonEmptyStatement)
    .map(addSemicolon);
}

/**
 * Trim whitespace from statement.
 * @param {string} statement - Statement to trim
 * @returns {string} Trimmed statement
 */
function trimStatement(statement: string): string {
  return statement.trim();
}

/**
 * Check if statement is non-empty after trimming.
 * @param {string} statement - Statement to check
 * @returns {boolean} True if statement has content
 */
function isNonEmptyStatement(statement: string): boolean {
  return statement.length > 0;
}

/**
 * Add semicolon to statement.
 * @param {string} statement - Statement to add semicolon to
 * @returns {string} Statement with semicolon
 */
function addSemicolon(statement: string): string {
  return statement + ";";
}
