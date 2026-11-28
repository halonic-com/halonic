import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { decideFileBuildOptions, rulesFile, workerBuildOptions } from "./build-options.ts";
import { writeDataManifest } from "./data-manifest.ts";
import { manifest } from "./manifest.ts";

/**
 * Builds the Agent tools plugin into `dist/`: the worker and manifest with
 * {@link workerBuildOptions}, and the board's Worker agents page, which
 * leaves React and the SDK's components to the page Paperclip gives it,
 * and the merge rules file the Merger loads ({@link decideFileBuildOptions}).
 *
 * Run it with `pnpm run build:plugin` from this package.
 */
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

await build({ ...workerBuildOptions, outdir: here("../../dist/") });
// The manifest ships as data only, so the server's deployer can read it without running it (HAL-19231).
await writeDataManifest(here("../../dist/manifest.js"), manifest);
const rules = rulesFile((await build(decideFileBuildOptions)).outputFiles[0]?.text ?? "");
await writeFile(here(`../../dist/${rules.name}`), rules.text);
await build({
  entryPoints: [here("../worker-agents/ui/index.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom", "@paperclipai/plugin-sdk/ui"],
  outfile: here("../../dist/ui/index.js"),
});
