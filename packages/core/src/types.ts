/**
 * Public types for the core API.
 */

/** A type expression. */
export interface TypeAst {
  readonly name: string;
  readonly args: readonly TypeArg[];
}

/** A type expression argument. */
export type TypeArg = TypeAst | number | string | EnumMember;

/** Enum member for Enum8/Enum16. */
export interface EnumMember { readonly key: string; readonly value: number }

/** Column definition. */
export interface ColumnAst {
  readonly name: string;
  readonly type: TypeAst;
  readonly rawType: string;
  readonly comment?: string;
  readonly default?: string;
}

/** Table AST. */
export interface TableAst {
  readonly name: string;
  readonly columns: readonly ColumnAst[];
  /** Optional PARTITION BY expression captured raw. */
  readonly partitionBy?: string;
  /** Optional ORDER BY expression captured raw. */
  readonly orderBy?: string;
  /** For materialized views without explicit columns: source table name. */
  readonly mvFrom?: string;
  /** For materialized views without explicit columns: select items. */
  readonly mvSelect?: readonly { name: string; alias?: string; srcName?: string; func?: string }[];
  /** Optional: information extracted from a WITH CTE inside MV. */
  readonly mvCte?: {
    readonly name: string;
    readonly src?: string; // source table from FROM clause of CTE
    readonly columns: readonly { name: string; alias?: string; srcName?: string; func?: string }[];
  };
}

/** Mapping configuration options. */
export interface MappingOptions {
  readonly int64As: 'bigint' | 'string';
  readonly decimal: 'string' | 'decimal.js';
  readonly datetimeAs: 'string' | 'Date';
  readonly camelCase: boolean;
  readonly failOnUnknown?: boolean;
  /** Optional mapping plugins to override or extend type mapping. */
  readonly plugins?: readonly MappingPlugin[];
}

/** Emission configuration options. */
export interface EmissionOptions {
  readonly emitZod: boolean;
}

/** Structure after mapping to TS types. */
export interface MappedTable {
  readonly interfaceName: string;
  readonly columns: readonly {
    readonly name: string;
    readonly tsType: string;
    readonly chType: string;
    readonly typeAst: TypeAst;
    readonly comment?: string;
  }[];
  /** Original table metadata for docs. */
  readonly meta?: { partitionBy?: string; orderBy?: string };
}

/** Convert a string to camelCase. */
export function toCamelCase(input: string): string {
  return input
    .replace(/[_-]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/** Convert a string to PascalCase. */
export function toPascalCase(input: string): string {
  const camel = toCamelCase(input);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Mapping plugin interface for custom type resolutions. */
export interface MappingPlugin {
  /**
   * Optionally map a type. Return a TS type string to override, or undefined to let core handle it.
   */
  mapType(type: TypeAst, ctx: { options: MappingOptions }): string | undefined;
}
