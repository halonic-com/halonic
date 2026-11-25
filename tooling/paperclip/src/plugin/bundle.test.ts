import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { workerBuildOptions } from "./build-options.ts";

/**
 * The worker bundle with the workflow engine in it (HAL-17774), built in
 * memory as `build:plugin` builds it. Liam's conditions (HAL-17772,
 * HAL-18009): a size limit set with the first engine PR, and the bundled
 * engine uses core packages only, no adapters, targets or Studio.
 */

/** The worker's size limit: 2.86 MB when the engine joined (2.00 MB before), with room to grow. */
const workerLimitBytes = 3_500_000;

/**
 * Opens the engine as the worker does, moves one run to `review` and prints
 * its state. Bundled with the worker's options and run in its own Node
 * process, because Vitest would lend the bundle a `require` the worker lacks.
 */
const engineSmoke = `
import { fixedIds } from "@halonicjs/std";
import { openEngineHost } from "./engine-host.ts";
const saved = new Map();
const state = {
  get: async (key) => saved.get(JSON.stringify(key)) ?? null,
  set: async (key, value) => { saved.set(JSON.stringify(key), structuredClone(value)); },
  delete: async (key) => { saved.delete(JSON.stringify(key)); },
};
const host = openEngineHost(state, "acme", { now: () => new Date("2026-11-25T00:00:00Z") }, fixedIds());
await host.executor.start({ hubId: "agent-tools", workflowId: "fast-track", input: {}, runId: "smoke" });
await host.drain();
await host.events.sendEvent("smoke", "stage", undefined, { stage: "review" });
await host.drain();
console.log((await host.runs.get("smoke"))?.state);
await host.close();
`;

verifies("paperclip.fast-track-lifecycle", () => {
  it("keeps the worker bundle under its limit, with core packages only from packages/", async () => {
    const result = await build({
      ...workerBuildOptions,
      write: false,
      metafile: true,
      outdir: "dist",
      logLevel: "silent",
    });
    const worker = result.outputFiles.find((file) => file.path.endsWith("worker.js"));
    expect(worker?.contents.byteLength ?? Number.POSITIVE_INFINITY).toBeLessThan(workerLimitBytes);
    const packages = Object.keys(result.metafile.inputs)
      .map((input) => /(?:^|\/)packages\/([^/]+\/[^/]+)\//u.exec(input)?.[1])
      .filter((name) => name !== undefined);
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.filter((name) => !name.startsWith("core/"))).toEqual([]);
  });

  it("runs the bundled engine: a run reaches review", async () => {
    const { entryPoints: _worker, ...options } = workerBuildOptions;
    const result = await build({
      ...options,
      stdin: {
        contents: engineSmoke,
        resolveDir: fileURLToPath(new URL("../workflow-host/", import.meta.url)),
        loader: "ts",
      },
      write: false,
      logLevel: "silent",
    });
    const folder = await mkdtemp(join(tmpdir(), "agent-tools-bundle-"));
    try {
      const file = join(folder, "smoke.mjs");
      await writeFile(file, result.outputFiles[0]?.contents ?? new Uint8Array());
      const { stdout } = await promisify(execFile)(process.execPath, [file], { windowsHide: true });
      expect(stdout.trim()).toBe("review");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
