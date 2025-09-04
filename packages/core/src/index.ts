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
import { map as _map, mapTypeAstToTs } from "./mapping.js";
import { emit as _emit } from "./emitter.js";
import { emitJsonSchema as _emitJsonSchema } from "./json-schema.js";

export function parse(ddl: string): readonly TableAst[] {
  const parts = splitStatements(filterStatements(ddl));
  if (parts.length === 0) return [] as const;
  const tables: TableAst[] = [];
  for (const stmt of parts) {
    try {
      const arr = _parse(stmt);
      if (arr.length > 0) tables.push(...arr);
    } catch {
      // Skip statements we can't parse (e.g., complex views)
      continue;
    }
  }
  return tables;
}
export { mapTypeAstToTs } from "./mapping.js";
export function map(
  tables: readonly TableAst[],
  options: MappingOptions,
): readonly MappedTable[] {
  return _map(tables, options);
}
export function emit(
  mapped: readonly MappedTable[],
  options: EmissionOptions,
): string {
  return _emit(mapped, options);
}
export function emitJsonSchema(mapped: readonly MappedTable[]): string {
  return _emitJsonSchema(mapped);
}

export function generateSource(
  ddl: string,
  mapping: MappingOptions,
  emission: EmissionOptions,
): string {
  const ast = parse(ddl);
  const mapped = map(ast, mapping);
  return emit(mapped, emission);
}

function filterStatements(input: string): string {
  const parts = input
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const kept: string[] = [];
  for (const s of parts) {
    const head = s.slice(0, 200).toLowerCase();
    if (/^create\s+materialized\s+view/.test(head)) {
      // Skip MV only if it routes to another table (contains ' to ' or ' for ')
      const lower = s.toLowerCase();
      if (/(\s|\))to\s+/.test(lower) || /(\s|\))for\s+/.test(lower)) continue;
    }
    if (/^create\s+view/.test(head)) continue;
    kept.push(s);
  }
  return kept.length ? kept.join(";\n") + ";" : "";
}

function splitStatements(input: string): string[] {
  return input
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}
