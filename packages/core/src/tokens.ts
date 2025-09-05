import { createToken, Lexer } from "chevrotain";

// Comments and whitespace (skipped)
export const LineComment = createToken({
  name: "LineComment",
  pattern: /--[^\n]*/,
  group: Lexer.SKIPPED,
});

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
});

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t\n\r\f]+/,
  group: Lexer.SKIPPED,
});

// Punctuation
export const LParen = createToken({
  name: "LParen",
  pattern: /\(/,
});

export const RParen = createToken({
  name: "RParen",
  pattern: /\)/,
});

export const Comma = createToken({
  name: "Comma",
  pattern: /,/,
});

export const Dot = createToken({
  name: "Dot",
  pattern: /\./,
});

export const Eq = createToken({
  name: "Eq",
  pattern: /=/,
});

export const Semi = createToken({
  name: "Semi",
  pattern: /;/,
  group: Lexer.SKIPPED,
});

// Keywords
export const Create = createToken({
  name: "Create",
  pattern: /\bCREATE\b/i,
});

export const Table = createToken({
  name: "Table",
  pattern: /\bTABLE\b/i,
});

export const Materialized = createToken({
  name: "Materialized",
  pattern: /\bMATERIALIZED\b/i,
});

export const View = createToken({
  name: "View",
  pattern: /\bVIEW\b/i,
});

export const If = createToken({
  name: "If",
  pattern: /\bIF\b/i,
});

export const Not = createToken({
  name: "Not",
  pattern: /\bNOT\b/i,
});

export const Exists = createToken({
  name: "Exists",
  pattern: /\bEXISTS\b/i,
});

export const Comment = createToken({
  name: "Comment",
  pattern: /\bCOMMENT\b/i,
});

export const Default = createToken({
  name: "Default",
  pattern: /\bDEFAULT\b/i,
});

export const Codec = createToken({
  name: "Codec",
  pattern: /\bCODEC\b/i,
});

export const Partition = createToken({
  name: "Partition",
  pattern: /\bPARTITION\b/i,
});

export const Order = createToken({
  name: "Order",
  pattern: /\bORDER\b/i,
});

export const By = createToken({
  name: "By",
  pattern: /\bBY\b/i,
});

export const Engine = createToken({
  name: "Engine",
  pattern: /\bENGINE\b/i,
});

export const As = createToken({
  name: "As",
  pattern: /\bAS\b/i,
});

export const With = createToken({
  name: "With",
  pattern: /\bWITH\b/i,
});

export const Select = createToken({
  name: "Select",
  pattern: /\bSELECT\b/i,
});

export const From = createToken({
  name: "From",
  pattern: /\bFROM\b/i,
});

export const To = createToken({
  name: "To",
  pattern: /\bTO\b/i,
});

export const For = createToken({
  name: "For",
  pattern: /\bFOR\b/i,
});

// Literals
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'(?:[^'\\]|\\.)*'/,
});

export const Integer = createToken({
  name: "Integer",
  pattern: /\d+/,
});

export const Identifier = createToken({
  name: "Identifier",
  pattern: /[A-Za-z_][A-Za-z0-9_]*/,
});

// Catch-all for any unrecognized single non-whitespace character to avoid lexing failures
export const Unknown = createToken({
  name: "Unknown",
  pattern: /[^\s]/,
  group: Lexer.SKIPPED,
});

// Lexer with all tokens in correct order (keywords must come before Identifier)
export const ddlLexer = new Lexer([
  LineComment,
  BlockComment,
  WhiteSpace,
  LParen,
  RParen,
  Comma,
  Dot,
  Eq,
  Semi,
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
  Unknown,
]);
