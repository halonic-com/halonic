import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { entry, pass, pull, snapshot, stateWith } from "./merge-control.test-helper.ts";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Every module `start` loads at run time: value imports, re-exports
 * (`export … from`) and side-effect imports, but not `import type` or
 * `export type`.
 */
function runtimeGraph(start: string): Map<string, string> {
  const seen = new Map<string, string>();
  const visit = (file: string) => {
    if (seen.has(file)) {
      return;
    }
    const source = readFileSync(file, "utf8");
    seen.set(file, source);
    for (const [, kind, from] of source.matchAll(
      /^(?:import|export)\s+(type\s+)?(?:[^;"]*?from\s+)?"([^"]+)";/gms,
    )) {
      if (kind === undefined && from !== undefined) {
        visit(from.startsWith(".") ? resolve(dirname(file), from) : from);
      }
    }
  };
  visit(start);
  return seen;
}

/** The modules `start` loads that lie outside `root` or read a clock, network, file or randomness. */
function impure(start: string, root: string): string[] {
  return [...runtimeGraph(start)]
    .filter(([file, source]) => {
      const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      return (
        !file.startsWith(root) ||
        /\bfetch\(|Date\.now\(|new Date\(\)|Math\.random|process\.|require\(/.test(code)
      );
    })
    .map(([file]) => file.slice(root.length + 1));
}

verifies("paperclip.merge-control-pure", () => {
  test("decide loads only relative modules that read no clock, network, file or randomness", () => {
    const graph = runtimeGraph(resolve(here, "decide.ts"));
    expect(impure(resolve(here, "decide.ts"), resolve(here, ".."))).toEqual([]);
    expect(
      [...graph.keys()].map((file) => file.slice(resolve(here, "..").length + 1)).sort(),
    ).toContain("rules/queue-prio.ts");
  });

  test("the check follows re-exports and side-effect imports into an I/O module", () => {
    const root = mkdtempSync(join(tmpdir(), "merge-control-pure-"));
    writeFileSync(join(root, "clock.ts"), "export const at = () => Date.now();\n");
    writeFileSync(join(root, "types.ts"), 'export type { At } from "./typed.ts";\n');
    writeFileSync(join(root, "reexport.ts"), 'export * from "./clock.ts";\n');
    writeFileSync(join(root, "side.ts"), 'import "./clock.ts";\n');
    expect(impure(join(root, "reexport.ts"), root)).toEqual(["clock.ts"]);
    expect(impure(join(root, "side.ts"), root)).toEqual(["clock.ts"]);
    expect(impure(join(root, "types.ts"), root)).toEqual([]);
  });

  test("the same snapshot, state and time give the same decision, and the caller's state is left as it was", () => {
    const facts = snapshot({
      pulls: [pull(1), pull(2, { mergeable: "CONFLICTING" })],
      queue: [entry(2, 1)],
    });
    const state = stateWith({ readySince: { "9": "2026-11-24T10:00:00Z" } });
    const frozen = JSON.stringify(state);
    const first = pass(facts, state);
    expect(pass(facts, state)).toEqual(first);
    expect(JSON.stringify(state)).toBe(frozen);
    expect(first.state.lastQueue).toEqual([1]);
    expect(first.log.at(-1)?.text).toBe("queued=1 removed=#2 added=#1 candidatesPassing=1");
  });

  test("a queued pull request that left the queue and merged is logged", () => {
    const facts = snapshot({ merged: [{ number: 7, mergedAt: "2026-11-24T11:58:00Z" }] });
    const decision = pass(facts, stateWith({ lastQueue: [7, 8] }));
    expect(decision.log[0]).toEqual({ rule: "merged", text: "merged=#7" });
  });
});
