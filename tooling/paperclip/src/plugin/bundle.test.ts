import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "esbuild";
import { expect, it } from "vitest";

/**
 * The worker bundle with the workflow engine in it (HAL-17774), built in
 * memory as `build:plugin` builds it. Liam's conditions (HAL-17772,
 * HAL-18009): a size limit set with the first engine PR, and the bundled
 * engine uses core packages only, no adapters, targets or Studio.
 */

/** The worker's size limit: 2.86 MB when the engine joined (2.00 MB before), with room to grow. */
const workerLimitBytes = 3_500_000;

async function workerBundle() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./worker.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    loader: { ".yaml": "text" },
    write: false,
    metafile: true,
    outdir: "dist",
    logLevel: "silent",
  });
  return result;
}

verifies("paperclip.fast-track-lifecycle", () => {
  it("keeps the worker bundle under its limit, with core packages only from packages/", async () => {
    const result = await workerBundle();
    const worker = result.outputFiles.find((file) => file.path.endsWith("worker.js"));
    expect(worker?.contents.byteLength ?? Number.POSITIVE_INFINITY).toBeLessThan(workerLimitBytes);
    const packages = Object.keys(result.metafile.inputs)
      .map((input) => /(?:^|\/)packages\/([^/]+\/[^/]+)\//u.exec(input)?.[1])
      .filter((name) => name !== undefined);
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.filter((name) => !name.startsWith("core/"))).toEqual([]);
  });
});
