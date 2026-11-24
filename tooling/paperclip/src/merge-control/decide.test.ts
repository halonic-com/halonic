import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { entry, pass, pull, snapshot, stateWith } from "./merge-control.test-helper.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** Every module `decide.ts` loads at run time, following value imports only. */
function runtimeGraph(start: string): Map<string, string> {
  const seen = new Map<string, string>();
  const visit = (file: string) => {
    if (seen.has(file)) {
      return;
    }
    const source = readFileSync(file, "utf8");
    seen.set(file, source);
    for (const [, kind, from] of source.matchAll(
      /^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms,
    )) {
      if (kind === undefined && from !== undefined) {
        visit(from.startsWith(".") ? resolve(dirname(file), from) : from);
      }
    }
  };
  visit(start);
  return seen;
}

verifies("paperclip.merge-control-pure", () => {
  test("decide loads only relative modules that read no clock, network, file or randomness", () => {
    const graph = runtimeGraph(resolve(here, "decide.ts"));
    expect([...graph.keys()].filter((file) => !file.startsWith(resolve(here, "..")))).toEqual([]);
    for (const [file, source] of graph) {
      const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      expect({
        file,
        io: /\bfetch\(|Date\.now\(|new Date\(\)|Math\.random|process\.|require\(/.test(code),
      }).toEqual({ file, io: false });
    }
    expect(
      [...graph.keys()].map((file) => file.slice(resolve(here, "..").length + 1)).sort(),
    ).toContain("rules/queue-prio.ts");
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
