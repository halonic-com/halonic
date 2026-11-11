// Builds the runner into one file (design HAL-958, section 7). Inside its
// fence, Node may read only the runner file and the integration's folder, so
// the runner and everything it imports (our packages and Zod) have to be in
// that one file. esbuild is build-time tooling here: it never ships, and the
// file it writes may import nothing but Node's own modules.
//
// `pnpm build` runs this file and writes `dist/runner.mjs`.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** The runner process's entry, which the file is built from. */
export const runnerEntry = fileURLToPath(new URL("./src/runner/main.ts", import.meta.url));

/** What {@link buildRunnerFile} wrote. */
export interface RunnerFile {
  /** The file, as an absolute path. */
  readonly path: string;
  /** Its size in bytes. */
  readonly bytes: number;
  /** The modules it still imports: only Node's own, such as `node:stream`. */
  readonly imports: readonly string[];
}

/**
 * Writes the runner and everything it imports to `outFile`, as one ES module
 * for the Node version Halonic ships with.
 *
 * @throws {Error} when the build fails, or the file would still import a module that isn't Node's own
 */
export async function buildRunnerFile(outFile: string): Promise<RunnerFile> {
  const result = await build({
    entryPoints: [runnerEntry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    metafile: true,
    logLevel: "silent",
    banner: {
      js: "// The fenced integration runner, built by @halonicjs/adapter-integration-runner. Don't edit.\n",
    },
  });
  const [path, output] = Object.entries(result.metafile.outputs)[0] ?? [];
  if (path === undefined || output === undefined) {
    throw new Error("the runner build wrote no file");
  }
  const imports = output.imports.map((entry) => entry.path);
  const notNodes = imports.filter((name) => !name.startsWith("node:"));
  if (notNodes.length > 0) {
    throw new Error(
      `the runner file would import ${notNodes.join(", ")}, which Node can't read inside the fence`,
    );
  }
  return { path: outFile, bytes: output.bytes, imports: [...new Set(imports)].sort() };
}

if (import.meta.main) {
  const file = await buildRunnerFile(join(import.meta.dirname, "dist", "runner.mjs"));
  console.log(`Built ${file.path} (${file.bytes} bytes, imports ${file.imports.join(", ")}).`);
}
