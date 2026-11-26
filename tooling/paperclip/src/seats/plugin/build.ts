import { cp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { writeDataManifest } from "../../plugin/data-manifest.ts";
import { manifest } from "./manifest.ts";

/**
 * Builds the `seats` plugin into its own folder, `dist/seats/`, which the
 * board installs apart from Agent tools (Settings → Plugins, from a `main`
 * checkout on Halonic Server). Paperclip reads a plugin from a package folder,
 * so this writes the folder's `package.json` next to the bundles and copies
 * the migrations Paperclip runs before it starts the worker. The page goes
 * to `ui/index.js`; React and the SDK's components stay out of it, because
 * Paperclip's page hands the plugin its own copies.
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
// The manifest ships as data only, so the server's deployer can read it without running it (HAL-19231).
await writeDataManifest(`${outDir}manifest.js`, manifest);
await build({
  entryPoints: { index: here("../ui/index.tsx") },
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom", "@paperclipai/plugin-sdk/ui"],
  outdir: `${outDir}${manifest.entrypoints.ui ?? "ui"}/`,
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
