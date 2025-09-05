import type { TypeArg, TypeAst } from "./types.js";

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

export function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}


