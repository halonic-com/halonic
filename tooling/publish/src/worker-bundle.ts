import { createHash } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";

/** The Worker as one ES module script, and the SHA-256 of its bytes. */
export interface WorkerBundle {
  /** The script exactly as `halonic deploy` uploads it. */
  readonly script: string;
  /** Lowercase hex SHA-256 of the script's UTF-8 bytes: what `deploy status` shows as the bundle hash. */
  readonly hash: string;
}

/**
 * Builds the Worker's entry file and everything it imports into one ES module script
 * for workerd. The build is reproducible: the same sources and the same
 * esbuild version give the same bytes, whatever folder the repository is in,
 * whatever the time or the machine. It reads no environment variable, adds
 * no timestamp, no source map and no absolute path, and keeps esbuild's
 * path comments relative to the package that holds the entry file.
 *
 * @param entryPoint - absolute path of the Worker's entry file, `src/index.ts` of
 *   `@halonicjs/target-cloudflare-runtime`. Tooling can't depend on a target, so the caller resolves it.
 * @returns the script and its hash
 * @throws Error when the bundle doesn't build
 */
export async function buildWorkerBundle(entryPoint: string): Promise<WorkerBundle> {
  const result = await build({
    entryPoints: [entryPoint],
    absWorkingDir: path.resolve(path.dirname(entryPoint), ".."),
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    target: "es2024",
    // workerd provides `cloudflare:workers` (the Durable Object base class) when the Worker loads.
    external: ["cloudflare:*"],
    // Readable on purpose: a reviewer can read what is uploaded, and the hash covers all of it.
    minify: false,
    sourcemap: false,
    legalComments: "none",
    write: false,
    logLevel: "silent",
  }).catch((error: unknown) => {
    throw new Error(`The Worker didn't build.\n${String(error)}`, { cause: error });
  });
  const [file] = result.outputFiles;
  if (file === undefined || result.outputFiles.length !== 1) {
    throw new Error("esbuild didn't return exactly one file for the Worker.");
  }
  return { script: file.text, hash: hashScript(file.text) };
}

/** The lowercase hex SHA-256 of the script's UTF-8 bytes. */
export function hashScript(script: string): string {
  return createHash("sha256").update(script, "utf8").digest("hex");
}
