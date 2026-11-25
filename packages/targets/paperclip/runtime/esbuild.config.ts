// Builds the plugin worker into the one `worker.js` the plugin builder copies
// into every plugin (HAL-18001). Paperclip runs that file on its own, so the
// worker and everything it imports (our packages) have to be in it, and it may
// import nothing but its `snapshot.json`: no Node module and no Paperclip code. esbuild is
// build-time tooling here and never ships.
//
// `pnpm build` runs this file and writes `dist/worker.js`.

import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";

/** The worker's entry, which the file is built from. */
export const workerEntry = `${import.meta.dirname}/src/worker.ts`;

/** What {@link buildWorkerFile} wrote. */
export interface WorkerFile {
  /** The file, as an absolute path. */
  readonly path: string;
  /** Its text. */
  readonly text: string;
  /** The source files built into it, relative to the repo root. */
  readonly inputs: readonly string[];
}

/**
 * Writes the worker and everything it imports to `outFile`, as one ES module.
 *
 * @throws {Error} when the build fails, or the file would import any module or hold Paperclip code
 */
export async function buildWorkerFile(outFile: string): Promise<WorkerFile> {
  const result = await build({
    entryPoints: [workerEntry],
    outfile: outFile,
    bundle: true,
    platform: "neutral",
    format: "esm",
    target: "node24",
    metafile: true,
    write: false,
    // The builder writes `snapshot.json` next to `worker.js`; the worker reads it when it starts.
    external: ["./snapshot.json"],
    logLevel: "silent",
    banner: {
      js: "// The Paperclip plugin worker, built by @halonicjs/target-paperclip-runtime. Don't edit.\n",
    },
  });
  const output = result.outputFiles[0];
  const meta = Object.values(result.metafile.outputs)[0];
  if (output === undefined || meta === undefined) {
    throw new Error("the worker build wrote no file");
  }
  const imports = meta.imports.filter((entry) => entry.path !== "./snapshot.json");
  if (imports.length > 0) {
    throw new Error(
      `the worker file would import ${imports.map((entry) => entry.path).join(", ")}`,
    );
  }
  const inputs = Object.keys(meta.inputs);
  const paperclip = inputs.filter((input) => input.includes("@paperclipai"));
  if (paperclip.length > 0) {
    throw new Error(`the worker file would hold Paperclip code: ${paperclip.join(", ")}`);
  }
  return { path: outFile, text: output.text, inputs };
}

if (import.meta.main) {
  const file = await buildWorkerFile(`${import.meta.dirname}/dist/worker.js`);
  await mkdir(`${import.meta.dirname}/dist`, { recursive: true });
  await writeFile(file.path, file.text);
  console.log(`Built ${file.path} from ${file.inputs.length} files.`);
}
