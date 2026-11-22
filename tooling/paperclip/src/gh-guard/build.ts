import { chmod, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/**
 * Builds the `gh` wrapper into one file, `dist/gh-guard/gh`, that runs on
 * the runner's own Node with nothing installed beside it. It is CommonJS,
 * so it runs the same in this folder and alone at `/usr/local/bin/gh`,
 * where no `package.json` says what kind of module it is.
 *
 * Run it with `pnpm run build:gh-guard` from this package.
 */
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const outDir = here("../../dist/gh-guard/");
const outFile = `${outDir}gh`;

await rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: [here("main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
  outfile: outFile,
});
await writeFile(`${outDir}package.json`, `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
await chmod(outFile, 0o755);
