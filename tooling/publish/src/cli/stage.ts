import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageLayer } from "../stage.ts";
import { findLayers, layersDirectory } from "../workspace.ts";

/**
 * Builds the publishable copy of each layer package given by its layer
 * (`adapters`, `testing`), or of every layer package when none is given:
 * `pnpm --filter @halonicjs/tooling-publish run stage`. Prints the staged
 * folder, name and version.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const given = process.argv.slice(2);
const layers = given.length > 0 ? given : findLayers(root).map((config) => config.layer);
for (const layer of layers) {
  const staged = stageLayer(root, join(layersDirectory(root), layer));
  console.log(`stage: ${staged.name}@${staged.version} -> ${staged.directory}`);
}
