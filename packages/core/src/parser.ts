import type { IToken, TokenType } from "chevrotain";
import { assert } from "./ast-utils.js";
import type { TableAst, ColumnAst, TypeAst, TypeArg } from "./types.js";
import {
  ddlLexer,
  LParen,
  RParen,
  Comma,
  Dot,
  Eq,
  Create,
  Table,
  Materialized,
  View,
  If,
  Not,
  Exists,
  Comment,
  Default,
  Codec,
  Partition,
  Order,
  By,
  Engine,
  As,
  With,
  Select,
  From,
  To,
  For,
  StringLiteral,
  Integer,
  Identifier,
} from "./tokens.js";

/** Maximum parser recursion depth for safety. */
const MAX_PARSER_DEPTH = 100;

/** Parser state with explicit bounds. */
interface ParserState {
  readonly tokens: readonly IToken[];
  position: number;
  readonly maxTokens: number;
}

/**
 * Create initial parser state with bounds checking.
 * Validates token count doesn't exceed safety limit and initializes position tracking.
 * @param {readonly IToken[]} tokens - Array of lexed tokens
 * @returns {ParserState} Initialized parser state
 * @throws {Error} When token count exceeds 10,000 limit
 */
function createParserState(tokens: readonly IToken[]): ParserState {
  assert(tokens.length <= 10000, "Token count exceeds safety limit");
  return {
    tokens,
    position: 0,
    maxTokens: tokens.length,
  };
}

/**
 * Check if parser is at end of input.
 * Simple bounds check comparing current position to total token count.
 * @param {ParserState} state - Current parser state
 * @returns {boolean} True when all tokens have been consumed
 */
function isAtEnd(state: ParserState): boolean {
  return state.position >= state.maxTokens;
}

/**
 * Peek at token with optional offset.
 * Safely accesses token array without advancing position, returns undefined if out of bounds.
 * @param {ParserState} state - Current parser state
 * @param {number} [offset=0] - Look-ahead distance from current position
 * @returns {IToken | undefined} Token at position + offset, or undefined
 */
function peekToken(state: ParserState, offset = 0): IToken | undefined {
  const pos = state.position + offset;
  return pos < state.maxTokens ? state.tokens[pos] : undefined;
}

/**
 * Try to match and consume a token type.
 * Advances position if token matches expected type, otherwise leaves position unchanged.
 * @param {ParserState} state - Current parser state
 * @param {TokenType} tokenType - Expected token type
 * @returns {boolean} True if token matched and consumed
 */
function tryMatch(state: ParserState, tokenType: TokenType): boolean {
  const token = peekToken(state);
  if (token && token.tokenType === tokenType) {
    state.position++;
    return true;
  }
  return false;
}

/**
 * Consume expected token or throw.
 * Advances position and returns token if type matches, otherwise throws descriptive error.
 * @param {ParserState} state - Current parser state
 * @param {TokenType} tokenType - Required token type
 * @param {string} expected - Human-readable description for error messages
 * @returns {IToken} The consumed token
 * @throws {Error} When token doesn't match expected type
 */
function consumeToken(
  state: ParserState,
  tokenType: TokenType,
  expected: string,
): IToken {
  const token = peekToken(state);
  if (!token || token.tokenType !== tokenType) {
    throw new Error(`Expected ${expected} at position ${state.position}`);
  }
  state.position++;
  return token;
}

/**
 * Skip tokens until finding target type, with safety limit.
 * Advances position until target token found or end reached, prevents infinite loops.
 * @param {ParserState} state - Current parser state
 * @param {TokenType} targetType - Token type to search for
 * @throws {Error} When skip limit (1000 tokens) exceeded
 */
function skipToToken(state: ParserState, targetType: TokenType): void {
  const startPos = state.position;
  while (!isAtEnd(state) && !tryMatch(state, targetType)) {
    state.position++;
    if (state.position - startPos > 1000) {
      throw new Error("Skip limit exceeded - possible infinite loop");
    }
  }
}

/**
 * Skip balanced parentheses with depth tracking and bounds.
 * Advances through nested parentheses maintaining balance count, used for complex expressions.
 * @param {ParserState} state - Current parser state
 * @throws {Error} When parentheses depth limit (1000 tokens) exceeded
 */
function skipBalancedParens(state: ParserState): void {
  let depth = 1;
  const startPos = state.position;

  while (!isAtEnd(state) && depth > 0) {
    if (tryMatch(state, LParen)) depth++;
    else if (tryMatch(state, RParen)) depth--;
    else state.position++;

    if (state.position - startPos > 1000) {
      throw new Error("Parentheses depth limit exceeded");
    }
  }
}

/** Parse ClickHouse DDL (subset) into AST. */
export function parse(ddl: string): readonly TableAst[] {
  assert(typeof ddl === "string", "DDL must be a string");
  const lex = ddlLexer.tokenize(ddl);
  if (lex.errors.length > 0) throw new Error("Lexing failed");
  const tokens: readonly IToken[] = (lex.tokens ?? []) as IToken[];
  const state = createParserState(tokens);
  const p = new Parser(state);
  const tables: TableAst[] = [];

  // Parse all CREATE statements in the token stream
  const maxTables = 50;
  let tableCount = 0;

  while (!p.isAtEnd() && tableCount < maxTables) {
    // Skip to next CREATE token
    while (!p.isAtEnd() && peekToken(state)?.tokenType !== Create) {
      state.position++;
    }

    if (!p.isAtEnd()) {
      try {
        tables.push(p.createTable());
        tableCount++;
      } catch (error) {
        // Skip failed table parsing and continue to next CREATE
        while (!p.isAtEnd() && peekToken(state)?.tokenType !== Create) {
          state.position++;
        }
      }
    }
  }

  return tables;
}

/**
 * ClickHouse DDL parser with Tiger Style safety principles.
 * Parses CREATE TABLE and CREATE MATERIALIZED VIEW statements into structured AST.
 * Uses explicit state management and bounded operations for safety.
 */
class Parser {
  constructor(private readonly state: ParserState) {}

  /**
   * Check if parser has reached end of token stream.
   * @returns {boolean} True when all tokens consumed
   */
  isAtEnd(): boolean {
    return isAtEnd(this.state);
  }

  /**
   * Parse a complete CREATE TABLE or CREATE MATERIALIZED VIEW statement.
   * Orchestrates parsing of table header, columns, and clauses into unified AST node.
   * Delegates to specialized methods for materialized views when no explicit columns defined.
   * @returns {TableAst} Complete table AST with name, columns, and metadata
   */
  createTable(): TableAst {
    // Parse table header
    consumeToken(this.state, Create, "CREATE");
    const isMV = this.parseTableType();
    this.parseOptionalIfNotExists();
    const name = this.parseQualifiedName();

    // Parse optional column definitions
    const columns = this.parseOptionalColumns();

    // Parse table clauses
    this.parseOptionalEngine();
    const partitionBy = this.parseOptionalPartitionBy();
    const orderBy = this.parseOptionalOrderBy();

    // Handle materialized view specifics
    if (isMV && columns.length === 0) {
      return this.parseMaterializedViewBody(name, partitionBy, orderBy);
    }

    return { name, columns, partitionBy, orderBy };
  }

  /**
   * Parse table type (TABLE vs MATERIALIZED VIEW).
   * Distinguishes between regular tables and materialized views for different parsing paths.
   * @returns {boolean} True if materialized view, false if regular table
   * @private
   */
  private parseTableType(): boolean {
    if (tryMatch(this.state, Materialized)) {
      consumeToken(this.state, View, "VIEW");
      return true;
    }
    consumeToken(this.state, Table, "TABLE");
    return false;
  }

  /**
   * Parse optional IF NOT EXISTS clause.
   * Handles the common SQL pattern for conditional table creation.
   * @private
   */
  private parseOptionalIfNotExists(): void {
    if (tryMatch(this.state, If)) {
      tryMatch(this.state, Not);
      tryMatch(this.state, Exists);
    }
  }

  /**
   * Parse optional column definitions in parentheses.
   * Handles comma-separated column list or empty parentheses, recovers from malformed syntax.
   * @returns {ColumnAst[]} Array of parsed column definitions
   * @private
   */
  private parseOptionalColumns(): ColumnAst[] {
    if (!tryMatch(this.state, LParen)) return [];
    if (tryMatch(this.state, RParen)) return [];

    const columns: ColumnAst[] = [];
    do {
      columns.push(this.parseColumnDef());
    } while (tryMatch(this.state, Comma));

    if (!tryMatch(this.state, RParen)) {
      skipToToken(this.state, RParen);
    }
    return columns;
  }

  /**
   * Parse optional ENGINE clause with parameters.
   * Handles ENGINE = EngineName(params) syntax, skips complex engine parameters.
   * @private
   */
  private parseOptionalEngine(): void {
    if (!tryMatch(this.state, Engine)) return;
    tryMatch(this.state, Eq);
    if (peekToken(this.state)?.tokenType === Identifier) {
      consumeToken(this.state, Identifier, "engine");
    }
    if (tryMatch(this.state, LParen)) {
      skipBalancedParens(this.state);
    }
  }

  /**
   * Parse optional PARTITION BY clause.
   * Captures partition expression as raw string until next major clause.
   * @returns {string | undefined} Partition expression or undefined
   * @private
   */
  private parseOptionalPartitionBy(): string | undefined {
    if (!tryMatch(this.state, Partition)) return undefined;
    consumeToken(this.state, By, "BY");
    return this.captureExpressionUntil([Order]);
  }

  /**
   * Parse optional ORDER BY clause.
   * Captures ordering expression as raw string until next major clause.
   * @returns {string | undefined} Order expression or undefined
   * @private
   */
  private parseOptionalOrderBy(): string | undefined {
    if (!tryMatch(this.state, Order)) return undefined;
    consumeToken(this.state, By, "BY");
    return this.captureExpressionUntil([As]);
  }

  /**
   * Parse CTE (Common Table Expression) block with SELECT.
   * Handles full CTE parsing including SELECT list and FROM clause, then skips to end.
   * @returns {TableAst["mvCte"]} CTE metadata with name, source, and columns
   * @private
   */
  private parseCTEBlock(): TableAst["mvCte"] {
    const cteName = consumeToken(this.state, Identifier, "CTE name")
      .image as string;
    consumeToken(this.state, As, "AS");
    consumeToken(this.state, LParen, "(");
    consumeToken(this.state, Select, "SELECT");

    const cteItems = this.parseSelectList();
    const cteSrc = tryMatch(this.state, From)
      ? this.parseQualifiedName()
      : undefined;

    // Skip to the end of the CTE block
    let depth = 1;
    const startPos = this.state.position;

    while (!isAtEnd(this.state) && depth > 0) {
      if (tryMatch(this.state, LParen)) depth++;
      else if (tryMatch(this.state, RParen)) depth--;
      else this.state.position++;

      if (this.state.position - startPos > 2000) {
        throw new Error("CTE block parsing limit exceeded");
      }
    }

    // Look for the top-level SELECT after CTE
    if (peekToken(this.state)?.tokenType === Select) {
      this.state.position++;
    }

    return { name: cteName, src: cteSrc, columns: cteItems };
  }

  /**
   * Parse materialized view body with AS SELECT clause.
   * Handles complex MV syntax including WITH clauses, CTEs, and main SELECT statement.
   * Maps parsed SELECT columns to Unknown types for later type inference.
   * @param {string} name - Table name
   * @param {string} [partitionBy] - Optional partition expression
   * @param {string} [orderBy] - Optional order expression
   * @returns {TableAst} Complete materialized view AST
   * @private
   */
  private parseMaterializedViewBody(
    name: string,
    partitionBy?: string,
    orderBy?: string,
  ): TableAst {
    if (!tryMatch(this.state, As)) {
      skipToToken(this.state, As);
    }

    // Handle WITH clause (named expressions or CTE)
    let cteInfo: TableAst["mvCte"] = undefined;
    if (peekToken(this.state)?.tokenType === With) {
      this.state.position++; // consume WITH

      // Check if this is a CTE pattern (name AS (...))
      const t0 = peekToken(this.state);
      const t1 = peekToken(this.state, 1);
      const t2 = peekToken(this.state, 2);

      if (
        t0?.tokenType === Identifier &&
        t1?.tokenType === As &&
        t2?.tokenType === LParen
      ) {
        // This is a real CTE, parse it but don't consume the following SELECT
        cteInfo = this.parseCTEBlockOnly();
      } else {
        // This is just WITH named expressions, skip to SELECT
        this.skipWithNamedExpressions();
      }
    }

    // Ensure we're at SELECT for the main query
    if (peekToken(this.state)?.tokenType !== Select) {
      skipToToken(this.state, Select);
    }
    if (peekToken(this.state)?.tokenType === Select) {
      this.state.position++;
    }

    const selectCols = this.parseSelectList();
    const src = tryMatch(this.state, From)
      ? this.parseQualifiedName()
      : undefined;

    const columns = selectCols.map((sc) => ({
      name: sc.alias ?? sc.name,
      type: { name: "Unknown", args: [] },
      rawType: "Unknown",
      comment: undefined,
      default: undefined,
    }));

    return {
      name,
      columns,
      partitionBy,
      orderBy,
      mvFrom: src,
      mvSelect: selectCols,
      mvCte: cteInfo,
    };
  }

  /**
   * Parse CTE block header only, skip content.
   * Extracts CTE name and skips over complex CTE body for performance.
   * Used when we only need CTE metadata, not full content parsing.
   * @returns {TableAst["mvCte"]} CTE metadata with name only
   * @private
   */
  private parseCTEBlockOnly(): TableAst["mvCte"] {
    const cteName = consumeToken(this.state, Identifier, "CTE name")
      .image as string;
    consumeToken(this.state, As, "AS");
    consumeToken(this.state, LParen, "(");

    // Skip the entire CTE content - we don't need to parse it in detail
    let depth = 1;
    const startPos = this.state.position;

    while (!isAtEnd(this.state) && depth > 0) {
      if (tryMatch(this.state, LParen)) depth++;
      else if (tryMatch(this.state, RParen)) depth--;
      else this.state.position++;

      if (this.state.position - startPos > 5000) {
        throw new Error("CTE content parsing limit exceeded");
      }
    }

    // Don't consume the following SELECT - that's the main query
    return { name: cteName, src: undefined, columns: [] };
  }

  /**
   * Skip WITH named expressions until SELECT.
   * Handles complex WITH clauses that aren't CTEs, maintaining parentheses balance.
   * @private
   */
  private skipWithNamedExpressions(): void {
    let depth = 0;
    const startPos = this.state.position;

    while (!isAtEnd(this.state)) {
      const t = peekToken(this.state);
      if (!t) break;

      if (t.tokenType === LParen) {
        this.state.position++;
        depth++;
        continue;
      }

      if (t.tokenType === RParen) {
        this.state.position++;
        depth = Math.max(0, depth - 1);
        continue;
      }

      if (t.tokenType === Select && depth === 0) {
        break; // Don't consume SELECT, let caller handle it
      }

      this.state.position++;

      if (this.state.position - startPos > 2000) {
        throw new Error("WITH expressions parsing limit exceeded");
      }
    }
  }

  /**
   * Parse qualified table/column name (schema.name or name).
   * Handles optional schema prefix, returns the final name component.
   * @returns {string} The table or column name
   * @private
   */
  private parseQualifiedName(): string {
    const first = consumeToken(this.state, Identifier, "identifier")
      .image as string;
    if (tryMatch(this.state, Dot)) {
      const second = consumeToken(this.state, Identifier, "identifier")
        .image as string;
      return second;
    }
    return first;
  }

  /**
   * Parse complete column definition.
   * Handles column name, type, optional comment, default value, and codec.
   * Captures raw type string for later processing.
   * @returns {ColumnAst} Complete column AST node
   * @private
   */
  private parseColumnDef(): ColumnAst {
    this.skipToColumnName();
    const nameTok = consumeToken(this.state, Identifier, "column name");
    const typeStart = this.state.position;
    const type = this.parseTypeExpr();
    const typeEnd = this.state.position;

    const comment = this.parseOptionalComment();
    const defaultValue = this.parseOptionalDefault();
    this.parseOptionalCodec();

    const rawType = this.state.tokens
      .slice(typeStart, typeEnd)
      .map((t) => String(t.image))
      .join("");

    return {
      name: nameTok.image as string,
      type,
      rawType,
      comment,
      default: defaultValue,
    };
  }

  /**
   * Skip tokens until column name found.
   * Recovers from malformed column syntax by advancing to next identifier.
   * @private
   */
  private skipToColumnName(): void {
    const startPos = this.state.position;
    while (
      !isAtEnd(this.state) &&
      peekToken(this.state)?.tokenType !== Identifier &&
      peekToken(this.state)?.tokenType !== RParen
    ) {
      this.state.position++;
      if (this.state.position - startPos > 100) {
        throw new Error("Column name search limit exceeded");
      }
    }
  }

  /**
   * Parse optional COMMENT clause.
   * Extracts comment string and removes surrounding quotes.
   * @returns {string | undefined} Unquoted comment text or undefined
   * @private
   */
  private parseOptionalComment(): string | undefined {
    if (!tryMatch(this.state, Comment)) return undefined;
    const s = consumeToken(this.state, StringLiteral, "string").image as string;
    return unquote(s);
  }

  /**
   * Parse optional DEFAULT clause.
   * Captures default expression as space-separated tokens until next clause.
   * @returns {string | undefined} Default expression or undefined
   * @private
   */
  private parseOptionalDefault(): string | undefined {
    if (!tryMatch(this.state, Default)) return undefined;
    const parts: string[] = [];
    const startPos = this.state.position;

    while (true) {
      const t = peekToken(this.state);
      if (!t || t.tokenType === Comma || t.tokenType === RParen) break;
      parts.push(String(t.image));
      this.state.position++;

      if (this.state.position - startPos > 50) {
        throw new Error("Default value parsing limit exceeded");
      }
    }
    return parts.join(" ").trim();
  }

  /**
   * Parse optional CODEC clause.
   * Skips over codec parameters without detailed parsing.
   * @private
   */
  private parseOptionalCodec(): void {
    if (!tryMatch(this.state, Codec)) return;
    consumeToken(this.state, LParen, "(");
    const startPos = this.state.position;

    while (!tryMatch(this.state, RParen)) {
      if (isAtEnd(this.state)) throw new Error("Unterminated CODEC");
      this.state.position++;

      if (this.state.position - startPos > 100) {
        throw new Error("CODEC parsing limit exceeded");
      }
    }
  }

  /**
   * Parse ClickHouse type expression.
   * Handles type name and optional parameters (e.g., Array(String), Decimal(10,2)).
   * Normalizes type names to canonical form.
   * @returns {TypeAst} Type AST with name and arguments
   * @private
   */
  private parseTypeExpr(): TypeAst {
    const id = consumeToken(this.state, Identifier, "type identifier")
      .image as string;
    const name = canonicalTypeName(id);
    const args: TypeArg[] = [];

    if (tryMatch(this.state, LParen)) {
      if (!tryMatch(this.state, RParen)) {
        do {
          args.push(this.parseTypeArg(name));
        } while (tryMatch(this.state, Comma));
        consumeToken(this.state, RParen, ")");
      }
    }
    return { name, args };
  }

  /**
   * Parse type argument (nested type, string, or number).
   * Handles recursive type parsing for complex types and literal values.
   * @param {string} _parent - Parent type name (unused but kept for future extensions)
   * @returns {TypeArg} Type argument (nested type, string, or number)
   * @private
   */
  private parseTypeArg(_parent: string): TypeArg {
    const t = peekToken(this.state);
    if (!t) throw new Error("Unexpected EOF");

    if (t.tokenType === Identifier) return this.parseTypeExpr();

    if (t.tokenType === StringLiteral) {
      const key = unquote(
        consumeToken(this.state, StringLiteral, "string").image as string,
      );
      if (tryMatch(this.state, Eq)) {
        const val = Number(consumeToken(this.state, Integer, "integer").image);
        return { key, value: val };
      }
      return key;
    }

    if (t.tokenType === Integer) {
      return Number(consumeToken(this.state, Integer, "integer").image);
    }

    this.state.position++;
    return String(t.image ?? "");
  }

  /**
   * Parse SELECT column list.
   * Handles comma-separated list of columns, functions, and expressions with aliases.
   * Used for materialized view SELECT parsing.
   * @returns {Array} Array of select items with name, alias, source, and function info
   * @private
   */
  private parseSelectList(): {
    name: string;
    alias?: string;
    srcName?: string;
    func?: string;
  }[] {
    const items: {
      name: string;
      alias?: string;
      srcName?: string;
      func?: string;
    }[] = [];

    const maxItems = 100;
    let itemCount = 0;

    while (!isAtEnd(this.state) && itemCount < maxItems) {
      const t = peekToken(this.state);
      if (!t || t.tokenType === From) break;

      if (t.tokenType === Comma) {
        this.state.position++;
        continue;
      }

      if (t.tokenType === Identifier) {
        items.push(this.parseSelectItem());
        itemCount++;
        continue;
      }

      this.state.position++;
    }

    return items;
  }

  /**
   * Parse individual SELECT item (column, function call, or expression).
   * Handles qualified names, function calls, and optional AS aliases.
   * Extracts source column information for type inference.
   * @returns {Object} Select item with name, alias, source, and function metadata
   * @private
   */
  private parseSelectItem(): {
    name: string;
    alias?: string;
    srcName?: string;
    func?: string;
  } {
    const id1 = consumeToken(this.state, Identifier, "identifier")
      .image as string;
    let name = id1;

    if (tryMatch(this.state, Dot)) {
      const id2 = consumeToken(this.state, Identifier, "identifier")
        .image as string;
      name = id2;
    }

    let srcName: string | undefined;
    let funcName: string | undefined;

    if (tryMatch(this.state, LParen)) {
      funcName = id1;
      srcName = this.parseFirstFunctionArg();
    }

    const alias = tryMatch(this.state, As)
      ? (consumeToken(this.state, Identifier, "alias").image as string)
      : undefined;

    return {
      name,
      alias,
      srcName: srcName ?? name,
      func: funcName,
    };
  }

  /**
   * Parse first function argument to extract source column.
   * Navigates through nested function calls to find the underlying column reference.
   * Used for type inference in aggregate functions.
   * @returns {string | undefined} Source column name or undefined
   * @private
   */
  private parseFirstFunctionArg(): string | undefined {
    let depth = 1;
    let srcName: string | undefined;
    const startPos = this.state.position;

    while (!isAtEnd(this.state) && depth > 0) {
      const tt = peekToken(this.state);
      if (!tt) break;

      if (tt.tokenType === LParen) {
        this.state.position++;
        depth++;
        continue;
      }

      if (tt.tokenType === RParen) {
        this.state.position++;
        depth--;
        continue;
      }

      if (tt.tokenType === Identifier) {
        const inner1 = consumeToken(this.state, Identifier, "identifier")
          .image as string;
        if (peekToken(this.state)?.tokenType === LParen) continue;

        let inner = inner1;
        if (tryMatch(this.state, Dot)) {
          inner = consumeToken(this.state, Identifier, "identifier")
            .image as string;
        }

        if (!srcName) srcName = inner;
        continue;
      }

      this.state.position++;

      if (this.state.position - startPos > 200) {
        throw new Error("Function argument parsing limit exceeded");
      }
    }

    return srcName;
  }

  /**
   * Capture expression tokens until stopper found.
   * Collects raw token text for clauses like PARTITION BY and ORDER BY.
   * Stops at specified token types and cleans up trailing semicolons.
   * @param {TokenType[]} stoppers - Token types that end the expression
   * @returns {string} Raw expression text
   * @private
   */
  private captureExpressionUntil(stoppers: TokenType[]): string {
    const parts: string[] = [];
    const startPos = this.state.position;

    while (!isAtEnd(this.state)) {
      const t = peekToken(this.state);
      if (!t) break;
      if (stoppers.length > 0 && stoppers.includes(t.tokenType)) break;

      parts.push(String(t.image));
      this.state.position++;

      if (this.state.position - startPos > 500) {
        throw new Error("Expression capture limit exceeded");
      }
    }

    return parts.join("").trim().replace(/;\s*$/, "");
  }
}

/**
 * Normalize ClickHouse type names to canonical form.
 * Converts case-insensitive type names to standard PascalCase format.
 * Handles special cases for complex types and preserves existing capitalization.
 * @param {string} name - Raw type name from parser
 * @returns {string} Canonical type name
 */
function canonicalTypeName(name: string): string {
  const n = name.toLowerCase();
  switch (n) {
    case "nullable":
      return "Nullable";
    case "lowcardinality":
      return "LowCardinality";
    case "array":
      return "Array";
    case "tuple":
      return "Tuple";
    case "map":
      return "Map";
    case "enum8":
      return "Enum8";
    case "enum16":
      return "Enum16";
    case "decimal":
      return "Decimal";
    case "fixedstring":
      return "FixedString";
    case "datetime":
      return "DateTime";
    case "datetime64":
      return "DateTime64";
    default:
      return /^[A-Z]/.test(name)
        ? name
        : name.charAt(0).toUpperCase() + name.slice(1);
  }
}

/**
 * Remove quotes from string literals.
 * Handles single-quoted strings and unescapes internal quotes.
 * Returns original string if not quoted.
 * @param {string} s - Quoted or unquoted string
 * @returns {string} Unquoted string with escaped quotes resolved
 */
function unquote(s: string): string {
  return s.startsWith("'") && s.endsWith("'")
    ? s.slice(1, -1).replace(/\\'/g, "'")
    : s;
}
