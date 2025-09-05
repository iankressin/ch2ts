import type { EnumMember, TypeArg, TypeAst } from "./types.js";

/** Lightweight runtime assertion for invariants. */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Narrow a type argument to EnumMember when applicable. */
export function isEnumMember(arg: TypeArg | undefined): arg is EnumMember {
  return (
    typeof arg === "object" &&
    arg !== null &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (arg as any).key !== undefined &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (arg as any).value !== undefined
  );
}

export function isTypeAst(arg: TypeArg | undefined): arg is TypeAst {
  return (
    typeof arg === "object" && arg !== null && "name" in arg && "args" in arg
  );
}

export function toTypeOrUnknown(arg: TypeArg | undefined): TypeAst {
  return isTypeAst(arg) ? arg : { name: "Unknown", args: [] };
}

export function firstTypeArg(t: TypeAst): TypeAst {
  return toTypeOrUnknown(t.args[0]);
}

export function secondTypeArg(t: TypeAst): TypeAst {
  return toTypeOrUnknown(t.args[1]);
}
