import { createToken, Lexer, type IToken, type TokenType } from "chevrotain";
import { assert } from "./ast-utils.js";
import type { TableAst, ColumnAst, TypeAst, TypeArg } from "./types.js";

const LineComment = createToken({
  name: "LineComment",
  pattern: /--[^\n]*/,
  group: Lexer.SKIPPED,
});
const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
});
const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t\n\r\f]+/,
  group: Lexer.SKIPPED,
});
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const Dot = createToken({ name: "Dot", pattern: /\./ });
const Eq = createToken({ name: "Eq", pattern: /=/ });
const Semi = createToken({ name: "Semi", pattern: /;/, group: Lexer.SKIPPED });
const CREATE = createToken({ name: "CREATE", pattern: /\bCREATE\b/i });
const TABLE = createToken({ name: "TABLE", pattern: /\bTABLE\b/i });
const MATERIALIZED = createToken({
  name: "MATERIALIZED",
  pattern: /\bMATERIALIZED\b/i,
});
const VIEW = createToken({ name: "VIEW", pattern: /\bVIEW\b/i });
const IF = createToken({ name: "IF", pattern: /\bIF\b/i });
const NOT = createToken({ name: "NOT", pattern: /\bNOT\b/i });
const EXISTS = createToken({ name: "EXISTS", pattern: /\bEXISTS\b/i });
const COMMENT_KW = createToken({ name: "COMMENT_KW", pattern: /\bCOMMENT\b/i });
const DEFAULT_KW = createToken({ name: "DEFAULT_KW", pattern: /\bDEFAULT\b/i });
const CODEC_KW = createToken({ name: "CODEC_KW", pattern: /\bCODEC\b/i });
const PARTITION = createToken({ name: "PARTITION", pattern: /\bPARTITION\b/i });
const ORDER = createToken({ name: "ORDER", pattern: /\bORDER\b/i });
const BY = createToken({ name: "BY", pattern: /\bBY\b/i });
const ENGINE = createToken({ name: "ENGINE", pattern: /\bENGINE\b/i });
const AS = createToken({ name: "AS", pattern: /\bAS\b/i });
const WITH = createToken({ name: "WITH", pattern: /\bWITH\b/i });
const SELECT = createToken({ name: "SELECT", pattern: /\bSELECT\b/i });
const FROM = createToken({ name: "FROM", pattern: /\bFROM\b/i });
const TO = createToken({ name: "TO", pattern: /\bTO\b/i });
const FOR_T = createToken({ name: "FOR_T", pattern: /\bFOR\b/i });
const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'(?:[^'\\]|\\.)*'/,
});
const Integer = createToken({ name: "Integer", pattern: /\d+/ });
const Identifier = createToken({
  name: "Identifier",
  pattern: /[A-Za-z_][A-Za-z0-9_]*/,
});
// Catch-all for any unrecognized single non-whitespace character to avoid lexing failures
const Unknown = createToken({
  name: "Unknown",
  pattern: /[^\s]/,
  group: Lexer.SKIPPED,
});

const ddlLexer = new Lexer([
  LineComment,
  BlockComment,
  WhiteSpace,
  LParen,
  RParen,
  Comma,
  Dot,
  Eq,
  Semi,
  CREATE,
  TABLE,
  MATERIALIZED,
  VIEW,
  IF,
  NOT,
  EXISTS,
  COMMENT_KW,
  DEFAULT_KW,
  CODEC_KW,
  PARTITION,
  ORDER,
  BY,
  ENGINE,
  AS,
  WITH,
  SELECT,
  FROM,
  TO,
  FOR_T,
  StringLiteral,
  Integer,
  Identifier,
  Unknown,
]);

/** Parse ClickHouse DDL (subset) into AST. */
export function parse(ddl: string): readonly TableAst[] {
  const lex = ddlLexer.tokenize(ddl);
  if (lex.errors.length > 0) throw new Error("Lexing failed");
  const tokens: readonly IToken[] = (lex.tokens ?? []) as IToken[];
  const p = new Parser(tokens);
  const tables: TableAst[] = [];
  if (!p.isAtEnd()) tables.push(p.createTable());
  return tables;
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: readonly IToken[]) {}
  private static readonly MAX_STEPS = 200000;
  isAtEnd(): boolean {
    return this.i >= this.tokens.length;
  }
  private peek(o = 0): IToken | undefined {
    return this.tokens[this.i + o];
  }
  private match(tt: TokenType): boolean {
    const t = this.peek();
    if (t && t.tokenType === tt) {
      this.i++;
      return true;
    }
    return false;
  }
  private consume(tt: TokenType, what: string): IToken {
    const t = this.peek();
    if (!t || t.tokenType !== tt) throw new Error(`Expected ${what}`);
    this.i++;
    return t;
  }

  // Skip a balanced parenthesis block. Assumes the last consumed token was '('.
  private skipBalancedParens(): void {
    let depth = 1;
    let steps = 0;
    while (!this.isAtEnd() && depth > 0) {
      const t = this.peek();
      if (!t) break;
      if (t.tokenType === LParen) {
        this.i++;
        depth++;
      } else if (t.tokenType === RParen) {
        this.i++;
        depth--;
      } else {
        this.i++;
      }
      steps++;
      assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while skipping parentheses");
    }
  }

  createTable(): TableAst {
    this.consume(CREATE, "CREATE");
    let isMV = false;
    if (this.match(MATERIALIZED)) {
      this.consume(VIEW, "VIEW");
      isMV = true;
    } else {
      this.consume(TABLE, "TABLE");
    }

    // Optional IF NOT EXISTS
    if (this.match(IF)) {
      this.match(NOT);
      this.match(EXISTS);
    }
    const name = this.qualifiedName();
    let columns: ColumnAst[] = [];
    // Optional column list
    if (this.match(LParen)) {
      if (!this.match(RParen)) {
        do {
          columns.push(this.columnDef());
        } while (this.match(Comma));
        if (!this.match(RParen)) {
          let steps = 0;
          while (!this.isAtEnd() && !this.match(RParen)) {
            this.i++;
            steps++;
            assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while seeking ')' in column list");
          }
        }
      }
    }
    // Optional ENGINE, PARTITION BY and/or ORDER BY clauses; capture raw expression
    let partitionBy: string | undefined;
    let orderBy: string | undefined;
    // ENGINE = EngineName(...)
    if (this.match(ENGINE)) {
      // Optional '='
      this.match(Eq);
      // Engine identifier
      if (this.peek()?.tokenType === Identifier) {
        this.consume(Identifier, "engine");
      }
      // Optional ( ... ) skip until ')'
      if (this.match(LParen)) {
        this.skipBalancedParens();
      }
    }
    if (this.match(PARTITION)) {
      this.consume(BY, "BY");
      partitionBy = this.captureExpressionUntil([ORDER]);
    }
    if (this.match(ORDER)) {
      this.consume(BY, "BY");
      // Stop at AS (for MATERIALIZED VIEW) so we don't consume the SELECT clause
      orderBy = this.captureExpressionUntil([AS]);
    }
    if (isMV) {
      // Skip "TO" and "FOR" MVs (should have been filtered earlier); otherwise derive columns from SELECT when not provided
      if (columns.length === 0) {
        // expect possibly POPULATE or other options, then AS [WITH ...] SELECT ... FROM ...
        if (!this.match(AS)) {
          let steps = 0;
          while (!this.isAtEnd() && !this.match(AS)) {
            this.i++;
            steps++;
            assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while seeking AS in MV");
          }
        }
        // After AS, there may be a WITH CTE block; if present parse basic info, then read the top-level SELECT
        let cteName: string | undefined;
        let cteItems: ReturnType<Parser["parseSelectList"]> | undefined;
        let cteSrc: string | undefined;
        if (this.peek()?.tokenType === WITH) {
          this.i++; // consume WITH
          const t0 = this.peek();
          const t1 = this.peek(1);
          const t2 = this.peek(2);
          const looksLikeCte = !!(
            t0 &&
            t0.tokenType === Identifier &&
            t1 &&
            t1.tokenType === AS &&
            t2 &&
            t2.tokenType === LParen
          );
          if (looksLikeCte) {
            cteName = this.consume(Identifier, "CTE name").image as string;
            this.consume(AS, "AS");
            this.consume(LParen, "(");
            this.consume(SELECT, "SELECT");
            cteItems = this.parseSelectList();
            if (this.match(FROM)) {
              cteSrc = this.qualifiedName();
            }
            // Skip to matching ')'
            this.skipBalancedParens();
            // Top-level SELECT after CTE
            this.consume(SELECT, "SELECT");
          } else {
            // WITH named expressions. Skip until SELECT at top level
            let depth = 0;
            let steps = 0;
            while (!this.isAtEnd()) {
              const t = this.peek();
              if (!t) break;
              if (t.tokenType === LParen) {
                this.i++;
                depth++;
              } else if (t.tokenType === RParen) {
                this.i++;
                depth = Math.max(0, depth - 1);
              } else if (t.tokenType === SELECT && depth === 0) {
                this.i++;
                break;
              } else {
                this.i++;
              }
              steps++;
              assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while scanning WITH block");
            }
          }
        } else {
          this.consume(SELECT, "SELECT");
        }
        const selectCols = this.parseSelectList();
        // Find source table for type inference if any
        let src: string | undefined;
        if (this.match(FROM)) {
          src = this.qualifiedName();
        }
        // Use Unknown placeholder; mapping will resolve from source table
        columns = selectCols.map((sc) => ({
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
          mvCte: cteName
            ? { name: cteName, src: cteSrc, columns: cteItems ?? [] }
            : undefined,
        };
      }
    }
    return { name, columns, partitionBy, orderBy };
  }

  private qualifiedName(): string {
    const first = this.consume(Identifier, "identifier").image as string;
    if (this.match(Dot)) {
      const second = this.consume(Identifier, "identifier").image as string;
      return second;
    }
    return first;
  }

  private columnDef(): ColumnAst {
    // tolerate stray tokens until we find an identifier for column name
    while (
      !this.isAtEnd() &&
      this.peek()?.tokenType !== Identifier &&
      this.peek()?.tokenType !== RParen
    )
      this.i++;
    const nameTok = this.consume(Identifier, "column name");
    const typeStart = this.i;
    const type = this.typeExpr();
    const typeEnd = this.i;
    let comment: string | undefined;
    let def: string | undefined;
    if (this.match(COMMENT_KW)) {
      const s = this.consume(StringLiteral, "string").image as string;
      comment = unquote(s);
    }
    if (this.match(DEFAULT_KW)) {
      const parts: string[] = [];
      while (true) {
        const t = this.peek();
        if (!t || t.tokenType === Comma || t.tokenType === RParen) break;
        parts.push(String(t.image));
        this.i++;
      }
      def = parts.join(" ").trim();
    }
    if (this.match(CODEC_KW)) {
      this.consume(LParen, "(");
      this.skipBalancedParens();
    }
    const rawType = this.tokens
      .slice(typeStart, typeEnd)
      .map((t) => String(t.image))
      .join("");
    return {
      name: nameTok.image as string,
      type,
      rawType,
      comment,
      default: def,
    };
  }

  private typeExpr(): TypeAst {
    const id = this.consume(Identifier, "type identifier").image as string;
    const name = canonicalTypeName(id);
    const args: TypeArg[] = [];
    if (this.match(LParen)) {
      if (this.match(RParen)) {
        /* no args */
      } else {
        do {
          args.push(this.typeArg(name));
        } while (this.match(Comma));
        this.consume(RParen, ")");
      }
    }
    return { name, args };
  }

  private typeArg(_parent: string): TypeArg {
    const t = this.peek();
    if (!t) throw new Error("Unexpected EOF");
    if (t.tokenType === Identifier) return this.typeExpr();
    if (t.tokenType === StringLiteral) {
      const key = unquote(
        this.consume(StringLiteral, "string").image as string,
      );
      if (this.match(Eq)) {
        const val = Number(this.consume(Integer, "integer").image);
        return { key, value: val };
      }
      return key;
    }
    if (t.tokenType === Integer)
      return Number(this.consume(Integer, "integer").image);
    this.i++;
    return String(t.image ?? "");
  }

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
    let steps = 0;
    while (!this.isAtEnd()) {
      const t = this.peek();
      if (!t) break;
      if (t.tokenType === FROM) break;
      if (t.tokenType === Comma) {
        this.i++;
        continue;
      }
      // identifier, optionally qualified or a function call with args
      if (t.tokenType === Identifier) {
        const id1 = this.consume(Identifier, "identifier").image as string;
        let name = id1;
        if (this.match(Dot)) {
          const id2 = this.consume(Identifier, "identifier").image as string;
          name = id2;
        }
        // Look for function call and try to capture a plausible source column as srcName
        let srcName: string | undefined;
        let funcName: string | undefined;
        if (this.match(LParen)) {
          funcName = id1; // the identifier before '(' is function name
          let depth = 1;
          while (!this.isAtEnd() && depth > 0) {
            const tt = this.peek();
            if (!tt) break;
            if (tt.tokenType === LParen) {
              this.i++;
              depth++;
            } else if (tt.tokenType === RParen) {
              this.i++;
              depth--;
            } else if (tt.tokenType === Identifier) {
              const inner1 = this.consume(Identifier, "identifier").image as string;
              if (this.peek()?.tokenType === LParen) {
                // treat as nested function name; do not set srcName
              } else {
                let inner = inner1;
                if (this.match(Dot)) {
                  inner = this.consume(Identifier, "identifier").image as string;
                }
                if (!srcName) srcName = inner;
              }
            } else {
              // skip others
              this.i++;
            }
            steps++;
            assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while parsing function arguments");
          }
        }
        let alias: string | undefined;
        if (this.match(AS)) {
          alias = this.consume(Identifier, "alias").image as string;
        }
        if (!srcName) srcName = name; // default to identifier when no function args parsed
        items.push({ name, alias, srcName, func: funcName });
        continue;
      }
      // skip any other tokens until comma or FROM
      this.i++;
      steps++;
      assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while parsing select list");
    }
    return items;
  }

  private captureExpressionUntil(stoppers: TokenType[]): string {
    const parts: string[] = [];
    let steps = 0;
    while (!this.isAtEnd()) {
      const t = this.peek();
      if (!t) break;
      if (stoppers.length > 0 && stoppers.includes(t.tokenType)) break;
      parts.push(String(t.image));
      this.i++;
      steps++;
      assert(steps <= Parser.MAX_STEPS, "Exceeded max steps while capturing expression");
    }
    return parts.join("").trim().replace(/;\s*$/, "");
  }
}

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

function unquote(s: string): string {
  return s.startsWith("'") && s.endsWith("'")
    ? s.slice(1, -1).replace(/\\'/g, "'")
    : s;
}
