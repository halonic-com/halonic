import { cp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { manifest } from "./manifest.ts";

/**
 * Builds the `seats` plugin into its own folder, `dist/seats/`, which the
 * board installs apart from Agent tools (Settings → Plugins, from a `main`
 * checkout on Halonic Server). Paperclip reads a plugin from a package folder,
 * so this writes the folder's `package.json` next to the bundles and copies
 * the migrations Paperclip runs before it starts the worker.
 *
 * Run it with `pnpm run build:seats-plugin` from this package.
 */
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const outDir = here("../../../dist/seats/");

await rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: [here("worker.ts"), here("manifest.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outdir: outDir,
});
await cp(here("migrations/"), `${outDir}${manifest.database?.migrationsDir ?? "migrations"}/`, {
  recursive: true,
});
const pluginPackage = {
  name: "halonic-seats-plugin",
  version: manifest.version,
  private: true,
  type: "module",
  paperclipPlugin: { manifest: "./manifest.js", worker: `./${manifest.entrypoints.worker}` },
};
await writeFile(`${outDir}package.json`, `${JSON.stringify(pluginPackage, null, 2)}\n`);
