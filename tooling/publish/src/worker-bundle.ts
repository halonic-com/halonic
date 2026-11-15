import { createHash } from "node:crypto";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { type BuildFailure, build } from "esbuild";

/**
 * The most a Worker script may weigh once compressed: 10 MB, the paid-plan limit of Cloudflare Workers,
 * which counts the gzip size. Counted as 10,000,000 bytes, so a script near the limit fails here and
 * not at the upload.
 */
export const MAX_COMPRESSED_BYTES = 10_000_000;

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
 * @param options.maxCompressedBytes - the size limit of the gzip-compressed script, `MAX_COMPRESSED_BYTES` by default
 * @returns the script and its hash
 * @throws Error when the bundle doesn't build (the message names each import that couldn't be bundled)
 *   or when the compressed script is over the limit
 */
export async function buildWorkerBundle(
  entryPoint: string,
  options: { readonly maxCompressedBytes?: number } = {},
): Promise<WorkerBundle> {
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
    throw new Error(`The Worker didn't build.\n${describeFailure(error)}`, { cause: error });
  });
  const [file] = result.outputFiles;
  if (file === undefined || result.outputFiles.length !== 1) {
    throw new Error("esbuild didn't return exactly one file for the Worker.");
  }
  const limit = options.maxCompressedBytes ?? MAX_COMPRESSED_BYTES;
  const compressed = gzipSync(file.text).byteLength;
  if (compressed > limit) {
    throw new Error(
      `The Worker is too big to upload: ${compressed} bytes compressed, the limit is ${limit}.`,
    );
  }
  return { script: file.text, hash: hashScript(file.text) };
}

/** One line per esbuild error, so a failing import shows by name, e.g. `Could not resolve "left-pad"`. */
function describeFailure(error: unknown): string {
  const { errors } = error as Partial<BuildFailure>;
  if (!Array.isArray(errors) || errors.length === 0) return String(error);
  return errors
    .map(({ text, location }) => (location ? `${text} (${location.file}:${location.line})` : text))
    .join("\n");
}

/** The lowercase hex SHA-256 of the script's UTF-8 bytes. */
export function hashScript(script: string): string {
  return createHash("sha256").update(script, "utf8").digest("hex");
}
