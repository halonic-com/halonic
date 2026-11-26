import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workerEntry } from "./worker-isolate.ts";

// HAL-188: Halonic never runs a file under a skill's `scripts/` folder. This
// file is the `scriptsTest` of `worker-run.ts` and `worker-entry.ts` in
// `tooling/check/process-starters.json`. The isolate starts one fixed file
// as each run's worker thread, `worker-entry.ts` next to it, never a path a
// workspace or a script names; that worker imports only the QuickJS isolate
// and the message shapes, and starts nothing itself.

verifies("toolscript-quickjs-node.worker-isolate", () => {
  it("starts only worker-entry.ts in this package as a worker, never a scripts/ file", () => {
    const entry = fileURLToPath(workerEntry).replaceAll("\\", "/");
    expect(entry).toMatch(/\/toolscript-quickjs-node\/src\/worker-entry\.ts$/u);
    expect(entry).not.toContain("/scripts/");
  });

  it("gives the worker no import that could start a process or load a module by name", async () => {
    const source = await readFile(workerEntry, "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gmu)].map((match) => match[1]);
    expect(imports).toEqual([
      "node:worker_threads",
      "@halonicjs/adapter-toolscript-quickjs",
      "./worker-messages.ts",
    ]);
    expect(source).not.toMatch(/\bimport\(|new Worker|createRequire|getBuiltinModule/u);
  });
});
