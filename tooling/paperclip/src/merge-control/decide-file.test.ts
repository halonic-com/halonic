import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "esbuild";
import { expect, test } from "vitest";
import { decideFileBuildOptions, decideFileName } from "../plugin/build-options.ts";
import { manifest } from "../plugin/manifest.ts";
import { decide } from "./decide.ts";
import { type DecideFileInput, decidePass } from "./decide-file.ts";
import {
  boardLogin,
  enqueued,
  entry,
  now,
  pull,
  snapshot,
  stateWith,
  testSettings,
} from "./merge-control.test-helper.ts";
import { emptyMergeState } from "./state.ts";

/** The rules file as `build:plugin` writes it, as text. */
async function bundled(): Promise<string> {
  const result = await build({ ...decideFileBuildOptions, write: false, logLevel: "silent" });
  return result.outputFiles[0]?.text ?? "";
}

/** A pass the Merger could hand in: a fast-track pull request labelled by the board, one conflicting entry. */
function input(): DecideFileInput {
  const facts = snapshot({
    pulls: [
      pull(1),
      pull(2, { mergeable: "CONFLICTING" }),
      pull(3, { labels: ["built-on:paperclip", "fast-track"], fastTrackBy: boardLogin }),
    ],
    queue: [entry(2, 1)],
  });
  const state = stateWith({ readySince: { "9": "2026-11-24T10:00:00Z" } });
  return JSON.parse(
    JSON.stringify({
      snapshot: facts,
      state,
      settings: { fastTrackLabellers: testSettings.fastTrackLabellers },
      now: now.toISOString(),
    }),
  );
}

verifies("paperclip.merge-control-decide-file", () => {
  test("the rules file imports nothing and reads no clock, network, file, randomness or process", async () => {
    const text = await bundled();
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(200_000);
    expect(text).not.toMatch(/^\s*import\b|\bimport\(|\brequire\(/m);
    expect(text).not.toMatch(/\bfetch\(|Date\.now\(|new Date\(\)|Math\.random|\bprocess\./);
  });

  test("a Node import anywhere behind decide fails the build", async () => {
    const { entryPoints: _rules, ...options } = decideFileBuildOptions;
    await expect(
      build({
        ...options,
        stdin: {
          contents: 'import { readFileSync } from "node:fs"; export const r = readFileSync;',
        },
        write: false,
        logLevel: "silent",
      }),
    ).rejects.toThrow(/node:fs/);
  });

  test("the loaded file answers as decide does, named for the plugin version", async () => {
    expect(decideFileBuildOptions.outfile).toBe(`merge-control-decide-${manifest.version}.js`);
    expect(decideFileName("0.11.0")).toBe("merge-control-decide-0.11.0.js");
    const folder = await mkdtemp(join(tmpdir(), "merge-rules-"));
    try {
      const file = join(folder, decideFileBuildOptions.outfile);
      await writeFile(file, await bundled());
      const loaded: { decidePass: typeof decidePass } = await import(pathToFileURL(file).href);
      const answer = loaded.decidePass(input());
      const direct = decide(input().snapshot, input().state ?? emptyMergeState, testSettings, now);
      expect(answer.rules).toBe(`halonic.agent-tools@${manifest.version}`);
      expect(answer.format).toBe(1);
      expect(
        JSON.parse(JSON.stringify({ ...answer, rules: undefined, format: undefined })),
      ).toEqual(JSON.parse(JSON.stringify(direct)));
      expect(enqueued(answer)).toEqual([3, 1]);
      expect(answer.actions).toContainEqual(
        expect.objectContaining({ kind: "dequeue", number: 2 }),
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  test("a first pass starts from the empty state, and the board's labeller comes only from the input", () => {
    const first = { ...input(), state: null, settings: {} };
    expect(decidePass(first).state).toEqual(
      decide(
        first.snapshot,
        emptyMergeState,
        { ...testSettings, fastTrackLabellers: ["halonic-dev"] },
        now,
      ).state,
    );
    // Without the board's login, #3's fast-track label counts for nothing: it waits its turn.
    expect(enqueued(decidePass(first))).toEqual([1, 3]);
  });

  test.each([
    ["a time that isn't one", { now: "soon" }, /"now" isn't a time/],
    [
      "a state of another version",
      { state: { ...emptyMergeState, version: 2 } },
      /state version 2/,
    ],
    [
      "a snapshot without its pull requests",
      { snapshot: { ...input().snapshot, pulls: undefined } },
      /no list pulls/,
    ],
    [
      "a misspelt setting",
      { settings: { fastTrackLabeller: [] } },
      /unknown setting fastTrackLabeller/,
    ],
    [
      "a setting named like an object's own key",
      { settings: { toString: [] } },
      /unknown setting toString/,
    ],
  ])("refuses %s, so the Merger falls back to its own rules", (_case, change, error) => {
    expect(() => decidePass({ ...input(), ...change } as DecideFileInput)).toThrow(error);
  });
});
