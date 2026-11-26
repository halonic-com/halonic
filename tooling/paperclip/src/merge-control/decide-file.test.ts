import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "esbuild";
import { expect, test } from "vitest";
import { decideFileBuildOptions, decideFileName, rulesFile } from "../plugin/build-options.ts";
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

/** The rules bundle before `build:plugin` names it, as text. */
async function bundled(): Promise<string> {
  const result = await build({ ...decideFileBuildOptions, logLevel: "silent" });
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

  test("the loaded file answers as decide does, named for the plugin version and its own hash", async () => {
    const rules = rulesFile(await bundled());
    expect(rules.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(rules.name).toBe(`merge-control-decide-${manifest.version}-${rules.hash}.js`);
    expect(decideFileName("0.11.0", "0123abcd")).toBe("merge-control-decide-0.11.0-0123abcd.js");
    const folder = await mkdtemp(join(tmpdir(), "merge-rules-"));
    try {
      const file = join(folder, rules.name);
      await writeFile(file, rules.text);
      const loaded: { decidePass: typeof decidePass } = await import(pathToFileURL(file).href);
      const answer = loaded.decidePass(input());
      const direct = decide(input().snapshot, input().state ?? emptyMergeState, testSettings, now);
      expect(answer.rules).toBe(`halonic.agent-tools@${manifest.version}+${rules.hash}`);
      expect(answer.format).toBe(3);
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

  test("the same rules get the same name, and other rules another", async () => {
    const text = await bundled();
    expect(rulesFile(text).name).toBe(rulesFile(await bundled()).name);
    expect(rulesFile(`${text}\n// a rule fix`).hash).not.toBe(rulesFile(text).hash);
    expect(() => rulesFile("no placeholder")).toThrow(/placeholder 0 times/);
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

  test("a state saved by older rules, without the fields added since, gets them from the empty state", () => {
    const { labelNoopReopened: _added, ...older } = emptyMergeState;
    const passed = { ...input(), state: { ...older, readySince: { "9": "2026-11-24T10:00:00Z" } } };
    const answer = decidePass(passed as unknown as DecideFileInput);
    expect(answer.state).toEqual(decidePass(input()).state);
    expect(answer.state.labelNoopReopened).toEqual({});
  });

  test("the board's flag on with the records given answers, and adds nothing the records don't approve", () => {
    const passed = { ...input(), settings: { verdictGate: true } };
    const answer = decidePass({ ...passed, snapshot: { ...passed.snapshot, recorded: {} } });
    expect(enqueued(answer)).toEqual([]);
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
    ["a number setting given as text", { settings: { fillTarget: "15" } }, /wrong type fillTarget/],
    [
      "a list setting holding something other than logins",
      { settings: { fastTrackLabellers: ["halonic-dev", 7] } },
      /wrong type fastTrackLabellers/,
    ],
    [
      "a text setting given as a list",
      { settings: { owner: ["halonic-com"] } },
      /wrong type owner/,
    ],
    [
      "the board's flag on with no recorded verdicts",
      { settings: { verdictGate: true } },
      /verdictGate is on, but the snapshot has no recorded verdicts/,
    ],
  ])("refuses %s, so the Merger falls back to its own rules", (_case, change, error) => {
    expect(() => decidePass({ ...input(), ...change } as DecideFileInput)).toThrow(error);
  });
});
