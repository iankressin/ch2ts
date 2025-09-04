# Project Description

## Goal

Build a TypeScript-based CLI tool that parses ClickHouse CREATE TABLE statements and generates clean, type-safe TypeScript interfaces (and optionally Zod schemas, JSON Schema). The tool must be fast to prototype, structured for long-term maintainability, and extensible for new DDL features.

## Tech Stack & Structure

- Language/Runtime: TypeScript on Node.js (ESM), organized as a pnpm monorepo with workspaces.
- Build System: tsup (CJS+ESM+bin), changesets for versioning and releases.
- CLI Framework: commander (or clipanion) with a user-friendly UX: flags for input path, output path, casing, bigint/decimal modes, zod emission, etc.
- Parser: chevrotain to implement a ClickHouse DDL subset (columns, types, defaults, codecs, comments). Incremental grammar, typed tokens, extendable for more DDL features.
- Codegen: ts-morph to programmatically emit .ts files with consistent formatting, imports, and JSDoc. Final formatting with Prettier.
- Validation Layer: Optional zod schemas emitted next to generated interfaces (--emit-zod).
- Testing: vitest with golden-file snapshots of input DDL → output TypeScript types.
- CI/CD: GitHub Actions for typechecking, linting, testing, and builds.
- Tooling: ESLint + Prettier for consistent code style.

## Core Functionality

### 1. Lexer/Parser (Chevrotain)

- Tokenize and parse ClickHouse column types: UInt64, LowCardinality(String), Nullable(Decimal(38,10)), Enum8(...), Array(T), Tuple(...), Map(K,V), IPv4, DateTime64, etc.
- Build an AST capturing column name, type, wrappers, precision/scale, default values, and comments.

### 2. Type Mapping Layer

- Pure functions converting ClickHouse types → configurable TS types.
- Examples:
  - Int64/UInt64 → bigint or string (--int64-as)
  - Decimal → string or Decimal via decimal.js (--decimal)
  - DateTime → string or Date (--datetime-as)
  - Enum8 → string union
  - Nullable(T) → T | null
  - Array(T) → T[]
  - Tuple(T1,T2,…) → structured object
  - Map(K,V) → Record<K,V>

### 3. Emitter (ts-morph)

- Emit TypeScript interfaces/types per table.
- Apply naming conventions (PascalCase for table names, camelCase for columns if --camel).
- Preserve column comments and ClickHouse raw type in JSDoc.
- Emit optional branded types (IPv4, IPv6).
- Optional Zod schema output (--emit-zod) with precise validators.

### 4. CLI UX

Examples:

```bash
subsquid-ch2ts create.sql --out types.ts --camel --int64-as bigint --decimal string
subsquid-ch2ts create.sql --out types.ts --emit-zod
subsquid-ch2ts create.sql --preset strict
```

## File Layout

```
packages/
  cli/         # CLI entrypoint, commander wiring
  core/        # lexer, parser, type mapping, emitter
  presets/     # mapping presets (safe, strict, decimal.js, bigint)
  testdata/    # input DDLs + golden outputs
```

## Code Quality, Readability & Maintainability Rules

### 1. Code Quality

- 100% strict TypeScript mode ("strict": true in tsconfig.json).
- No any, unknown must be narrowed before use.
- Every exported function and type must have JSDoc.
- Exhaustive switch statements with never checks to ensure no type is unhandled.
- Use pure functions in the mapping layer (no side effects).

### 2. Readability

- Consistent naming: PascalCase for types/interfaces, camelCase for variables/functions, SCREAMING_CASE for constants.
- Always include column comments and original ClickHouse type in generated JSDoc for traceability.
- Keep functions small (<50 lines), single-responsibility. Split large modules into submodules.
- Use Prettier + ESLint with a strict config (no unused vars, no implicit any, no shadowed vars).

### 3. Maintainability

- Modular package design: parser, mapper, emitter are fully isolated.
- CLI must call into core libraries, not contain core logic.
- Mapping presets (safe, strict, etc.) must live in dedicated config files, never hardcoded.
- Add unit tests for every mapping rule and snapshot tests for DDL parsing.
- CI must fail on lint, typecheck, or test failures.
- All new features must include tests and docs before merging.

### 4. Extensibility

- Grammar must be easy to extend for new DDL constructs (PARTITION BY, ORDER BY, etc.).
- Support plugin-style extensions for new type mappings.
- Keep public API stable: only expose parse, map, emit.

---

# Project Backlog

## Phase 1 – Project Setup

1. Initialize a pnpm monorepo with workspaces.
2. Configure TypeScript with strict: true in tsconfig.json.
3. Set up build tooling with tsup (CJS+ESM+bin output).
4. Integrate changesets for versioning and release management.
5. Add ESLint + Prettier with a strict configuration (no unused vars, no implicit any, no shadowed vars).
6. Configure Vitest for unit and snapshot testing.
7. Create GitHub Actions CI pipelines to run typecheck, lint, test, and build.

## Phase 2 – Core Parser

1. Add Chevrotain-based lexer/parser to handle ClickHouse CREATE TABLE subset:
   - Column definitions
   - Types (UInt, Int, Float, String, UUID, FixedString, Decimal, Nullable, LowCardinality, Array, Tuple, Map, Enum, Date/DateTime/DateTime64, IPv4, IPv6)
   - Defaults, codecs, comments

2. Build an AST structure capturing column name, type, wrappers, precision/scale, default, and comment.
3. Write snapshot tests with golden input DDLs → AST JSON outputs.

## Phase 3 – Type Mapping

1. Implement pure functions to map AST types to TypeScript types.
2. Support configuration via options:
   - --int64-as (bigint or string)
   - --decimal (string or decimal.js)
   - --datetime-as (string or Date)

3. Add presets (safe, strict, decimal.js, bigint) in a dedicated package.
4. Write unit tests for each mapping rule to ensure correctness.
5. Ensure exhaustiveness with switch + never checks for unmapped types.

## Phase 4 – Code Emission

1. Use ts-morph to programmatically emit .ts files.
2. Generate:
   - Exported interfaces (PascalCase table names, camelCase columns if --camel).
   - JSDoc including original ClickHouse type and column comments.
   - Branded types for IPv4 and IPv6.

3. Add optional Zod schema generation (--emit-zod).
4. Ensure formatting consistency via Prettier and ts-morph printer.
5. Add golden snapshot tests (DDL input → emitted TS files).

## Phase 5 – CLI Implementation

1. Implement CLI entrypoint with Commander (or Clipanion).
2. Add flags:
   - --out for output file
   - --camel for camelCase conversion
   - --int64-as, --decimal, --datetime-as
   - --emit-zod
   - --preset
   - --fail-on-unknown

3. Support stdin piping and file input.
4. Add watch mode (--watch) for automatic regeneration.
5. Add snapshot tests for CLI (input SQL → expected file output).

## Phase 6 – Quality & Maintainability

1. Enforce modular design:
   - CLI only wires commands, no core logic.
   - Core library provides parse, map, emit.

2. Ensure 100% test coverage for critical mapping and parsing paths.
3. Write developer documentation for extending grammar and adding new mappings.
4. Add examples in testdata/ (covering all ClickHouse type variants).
5. Configure CI to fail on lint/type/test errors.

## Phase 7 – Extensibility

1. Extend grammar to support PARTITION BY and ORDER BY (metadata in JSDoc).
2. Add plugin system for custom type mappings.
3. Implement optional --infer-from-db (read schema from ClickHouse system tables).
4. Add --emit-json-schema flag for downstream tooling.
5. Provide migration guide for future grammar or mapping extensions.
