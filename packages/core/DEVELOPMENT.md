Core development notes

Structure
- parser.ts: Chevrotain lexer + recursive-descent parser building TableAst/TypeAst.
- mapping.ts: Pure functions to map TypeAst → TypeScript types and build MappedTable.
- emitter.ts: ts-morph based code emission (interfaces, JSDoc, optional Zod).
- types.ts: Public types and small naming helpers.
- index.ts: Barrel exports + generateSource convenience.

Extending the grammar
- Add tokens or keywords in parser.ts (keep SKIPPED groups for whitespace/comments).
- Extend typeExpr/typeArg to support new wrappers/constructs (e.g., Nullable, Array, Tuple, Map, Enums).
- For table-level clauses (PARTITION BY, ORDER BY), parse and attach metadata on TableAst (extend types.ts), then decide whether to include it in JSDoc in emitter.

Adding new type mappings
- Update mapTypeAstToTs in mapping.ts for the new TypeAst.name.
- Keep the function pure (no side effects, return deterministic strings).
- Add unit tests in packages/core/src/mapping.test.ts to cover the new branch.
- If Zod needs to represent it specially, extend zodForTypeAst in emitter.ts analogously.

Testing
- Parser: snapshot tests in parser.test.ts should reflect AST evolution.
- Mapping: unit tests per rule in mapping.test.ts.
- Emitter: golden tests compare generated TS against files in testdata/golden.

Coding standards
- Strict TypeScript, no any. Exhaustive switches with safe fallbacks.
- Keep functions small and focused; split when >50 lines.
- Update docs and tests alongside changes.

