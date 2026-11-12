import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Metafile, type Plugin } from "esbuild";
import { missingShimApis } from "./matcher-check.ts";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const workerFolder = path.join(packageRoot, "src", "worker");
const shimFile = path.join(workerFolder, "vitest-shim.ts");
const testWorkerFile = path.join(workerFolder, "test-worker.ts");
const contractsFolder = path.dirname(
  fileURLToPath(import.meta.resolve("@halonicjs/testing-contracts")),
);

/** Points every `import … from "vitest"` in the bundle at the shim. */
const vitestShim: Plugin = {
  name: "vitest-shim",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^vitest$/ }, () => ({ path: shimFile }));
  },
};

/**
 * Tells esbuild that the contract suite files do nothing when imported (a
 * suite registers its cases only when its function is called). Then the
 * bundle keeps only the suites the Worker runs, through the package's one
 * entry point, and the shim check reads only those.
 */
const contractsWithoutSideEffects: Plugin = {
  name: "contracts-without-side-effects",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
      const fromContracts =
        args.importer.startsWith(contractsFolder) || args.path === "@halonicjs/testing-contracts";
      if (!fromContracts || args.pluginData === contractsFolder) {
        return undefined;
      }
      const { kind, importer, resolveDir } = args;
      const resolved = await pluginBuild.resolve(args.path, {
        kind,
        importer,
        resolveDir,
        pluginData: contractsFolder,
      });
      if (resolved.errors.length > 0 || !resolved.path.startsWith(contractsFolder)) {
        return { errors: resolved.errors };
      }
      return { ...resolved, sideEffects: false };
    });
  },
};

/**
 * Bundles the test Worker with the given suite files into one ES module
 * script for workerd. Each suite file registers its cases when it loads,
 * usually by calling a contract suite from `@halonicjs/testing-contracts`.
 *
 * @param suiteFiles - absolute paths or `file:` URLs of the suite files
 * @returns the Worker's script
 * @throws Error when the bundle doesn't build, which includes a suite
 *   importing something from `vitest` that the shim doesn't export, or
 *   calling a matcher the shim doesn't have
 */
export async function buildTestWorker(suiteFiles: readonly (string | URL)[]): Promise<string> {
  const entry = [
    `export { testWorker as default } from ${JSON.stringify(testWorkerFile)};`,
    ...suiteFiles.map((file) => `import ${JSON.stringify(toPath(file))};`),
  ].join("\n");
  const result = await build({
    stdin: {
      contents: entry,
      resolveDir: workerFolder,
      sourcefile: "test-worker-entry.ts",
      loader: "ts",
    },
    absWorkingDir: packageRoot,
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    target: "es2024",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [vitestShim, contractsWithoutSideEffects],
  }).catch((error: unknown) => {
    throw new Error(
      `The test Worker didn't build. "No matching export … for import" from "vitest" means src/worker/vitest-shim.ts needs it.\n${String(error)}`,
      { cause: error },
    );
  });
  await checkShimApis(result.metafile);
  const [script] = result.outputFiles;
  if (script === undefined) {
    throw new Error("esbuild built the test Worker but returned no file.");
  }
  return script.text;
}

/** Reads the test files that ended up in the bundle and fails on matchers the shim lacks. */
async function checkShimApis(metafile: Metafile): Promise<void> {
  const problems: string[] = [];
  for (const file of filesInBundle(metafile)) {
    const source = await readFile(path.resolve(packageRoot, file), "utf8");
    if (!source.includes('from "vitest"')) {
      continue;
    }
    const missing = missingShimApis(source);
    if (missing.length > 0) {
      problems.push(`${file} uses ${missing.join(", ")}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      [
        "The vitest shim in the test Worker lacks what a suite uses. Add matchers,",
        "modifiers and expect.X to src/worker/expect.ts, and it.X, test.X,",
        "describe.X and vi.X to src/worker/vitest-shim.ts:",
        ...problems,
      ].join("\n"),
    );
  }
}

/** The source files that contributed code to the bundle, skipping the generated entry and the shim. */
function filesInBundle(metafile: Metafile): string[] {
  return Object.values(metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([file, input]) => input.bytesInOutput > 0 && !file.startsWith("<stdin>"))
      .filter(([file]) => !path.resolve(packageRoot, file).startsWith(workerFolder))
      .map(([file]) => file),
  );
}

function toPath(file: string | URL): string {
  return file instanceof URL ? fileURLToPath(file) : file;
}
