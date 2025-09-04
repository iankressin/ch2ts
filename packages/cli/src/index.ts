import { Command } from "commander";
import {
  parse,
  map,
  emit,
  type EmissionOptions,
  type MappingOptions,
} from "@ch2ts/core";
import {
  bigintPreset,
  decimalJsPreset,
  safePreset,
  strictPreset,
  type PresetOptions,
} from "@ch2ts/presets";
import { readFile, writeFile } from "node:fs/promises";
import chokidar from "chokidar";
import { pathToFileURL } from "node:url";

/** CLI options after parsing arguments. */
export interface CliOptions {
  readonly out?: string;
  readonly camel: boolean;
  readonly int64As?: "bigint" | "string";
  readonly decimal?: "string" | "decimal.js";
  readonly datetimeAs?: "string" | "Date";
  readonly emitZod: boolean;
  readonly emitJsonSchema: boolean;
  readonly preset?: "safe" | "strict" | "decimal.js" | "bigint";
  readonly failOnUnknown: boolean;
  readonly watch: boolean;
}

/** Construct the Commander program (exposed for tests). */
export function buildCli(): Command {
  const program = new Command()
    .name("subsquid-ch2ts")
    .description(
      "Generate TypeScript types from ClickHouse CREATE TABLE statements",
    )
    .argument("[input]", "SQL file path (or omit to read from stdin)")
    .option("-o, --out <file>", "Output TypeScript file")
    .option("--camel", "Convert column names to camelCase", false)
    .option("--int64-as <mode>", "Map Int64/UInt64 as bigint|string", "bigint")
    .option("--decimal <mode>", "Map Decimal as string|decimal.js", "string")
    .option("--datetime-as <mode>", "Map DateTime as string|Date", "string")
    .option("--emit-zod", "Emit Zod schemas next to interfaces", false)
    .option(
      "--emit-json-schema",
      "Also emit JSON Schema (when --out is used)",
      false,
    )
    .option(
      "--preset <name>",
      "Use a predefined mapping preset (safe|strict|decimal.js|bigint)",
    )
    .option("--fail-on-unknown", "Fail when encountering unknown types", false)
    .option("-w, --watch", "Watch input file and regenerate on changes", false);
  return program;
}

/** Resolve preset into mapping options. */
function resolvePreset(
  preset?: CliOptions["preset"],
): PresetOptions | undefined {
  switch (preset) {
    case "safe":
      return safePreset;
    case "strict":
      return strictPreset;
    case "decimal.js":
      return decimalJsPreset;
    case "bigint":
      return bigintPreset;
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Run the CLI with the provided argv and optional stdin stream.
 * @param argv - Arguments (excluding node and script).
 * @param stdin - Optional stdin stream to read SQL from when no input path is provided.
 */
export async function runCli(
  argv: readonly string[],
  stdin?: NodeJS.ReadableStream,
): Promise<void> {
  const program = buildCli();
  program.parse(argv, { from: "user" });
  const inputPath: string | undefined = program.args[0];
  const opts = program.opts<CliOptions>();

  const preset = resolvePreset(opts.preset);
  const mapOpts: MappingOptions = {
    int64As: opts.int64As ?? preset?.int64As ?? "bigint",
    decimal: opts.decimal ?? preset?.decimal ?? "string",
    datetimeAs: opts.datetimeAs ?? preset?.datetimeAs ?? "string",
    camelCase: opts.camel,
    failOnUnknown: opts.failOnUnknown,
  };
  const emitOpts: EmissionOptions = { emitZod: opts.emitZod };

  const generateOnce = async () => {
    const sql = await readInputSql(inputPath, stdin);
    const tables = parse(sql);
    const mapped = map(tables, mapOpts);
    const out = emit(mapped, emitOpts);
    if (typeof opts.out === "string" && opts.out.length > 0) {
      await writeFile(opts.out, out, "utf8");
      if (opts.emitJsonSchema) {
        const mod = await import("@ch2ts/core");
        const emitJson = (
          mod as unknown as {
            emitJsonSchema: (mapped: ReturnType<typeof map>) => string;
          }
        ).emitJsonSchema;
        const json = emitJson(map(parse(sql), mapOpts));
        const schemaPath = deriveSchemaPath(opts.out);
        await writeFile(schemaPath, json, "utf8");
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(out);
    }
  };

  if (opts.watch) {
    if (!inputPath) {
      throw new Error("Watch mode requires an input file path");
    }
    await generateOnce();
    const watcher = chokidar.watch(inputPath, { ignoreInitial: true });
    const debounced = debounce(() => void generateOnce(), 80);
    watcher.on("change", debounced);
    // Keep running when used as a binary; programmatic users can ignore this behavior
    return new Promise(() => undefined);
  }

  await generateOnce();
}

async function readInputSql(
  inputPath: string | undefined,
  stdin: NodeJS.ReadableStream | undefined,
): Promise<string> {
  if (inputPath) {
    return await readFile(inputPath, "utf8");
  }
  if (!stdin) return "";
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    stdin.on("data", (c) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))),
    );
    stdin.on("end", () => resolve());
    stdin.on("close", () => resolve());
  });
  return Buffer.concat(chunks).toString("utf8");
}

function debounce(fn: () => void, ms: number) {
  let t: NodeJS.Timeout | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function deriveSchemaPath(outPath: string): string {
  const idx = outPath.lastIndexOf(".");
  if (idx > 0) return outPath.slice(0, idx) + ".schema.json";
  return outPath + ".schema.json";
}

// Invoke when used as a binary (supports both ESM and CJS builds).
const isCjsMain =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;
const isEsmMain = (() => {
  try {
    // import.meta may be undefined in CJS; guard access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = import.meta as unknown;
    return (
      !!meta &&
      typeof meta.url === "string" &&
      meta.url === pathToFileURL(process.argv[1] ?? "").href
    );
  } catch {
    return false;
  }
})();

if (isCjsMain || isEsmMain) {
  void runCli(process.argv.slice(2), process.stdin);
}
