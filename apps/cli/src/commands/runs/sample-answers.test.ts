import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  type StoredRun,
  storeRuns,
  today,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

const sampleLine =
  "On Sample answers: the built-in test model wrote this run's answers, not a real model.";

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-sample-answers");
  await writeFiles(acmeRuns.acme, {
    // A test model under another id, and a real model under the test model's usual id.
    "providers/scripted.yaml": "id: scripted\ntype: mock\n",
    "providers/mock.yaml": "id: mock\ntype: ollama\n",
    "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** One model call of the draft step, to `provider`. */
function call(provider: string): RunEventBody {
  return { type: "llm.request", agent: "writer", provider, model: "echo", messages: 2 };
}

/** A finished Support reply run, `0a0b0<last>`, whose draft step called these providers. */
function finishedWith(last: string, providers: readonly string[]): StoredRun {
  return {
    id: `run_mfx3k2a1_0a0b0${last}`,
    start: today("10:20:00"),
    after: [
      [today("10:20:00"), { type: "state.entered", state: "draft" }],
      ...providers.map((provider) => [today("10:20:01"), call(provider)] as const),
      [today("10:20:18"), { type: "run.completed", state: "draft", context: {} }],
    ],
  };
}

async function runs(...args: string[]): Promise<readonly string[]> {
  const io = captureIo(acmeRuns.acme);
  await runCli(["runs", ...args], io, [runsCommandWith(acmeRunsSetup(acmeRuns))]);
  return io.stdout;
}

/** The `runs --json` entries, each as its short id and its `sampleAnswers`. */
async function listedFlags(): Promise<Record<string, unknown>> {
  const json = JSON.parse((await runs("--json")).join("\n")) as {
    readonly runs: readonly { readonly id: string; readonly sampleAnswers: unknown }[];
  };
  return Object.fromEntries(json.runs.map((run) => [run.id.slice(-6), run.sampleAnswers]));
}

verifies("cli.sample-answers", () => {
  describe("halonic runs", () => {
    it("tags only a run whose every model call went to a provider of type mock", async () => {
      await storeRuns(
        acmeRuns,
        finishedWith("a", ["scripted", "scripted"]),
        finishedWith("b", ["scripted", "claude"]),
        finishedWith("c", ["mock"]),
        finishedWith("d", []),
        finishedWith("e", ["gone"]),
      );

      const rows = (await runs()).slice(0, 5);

      expect(rows.filter((row) => row.includes("Support reply · Sample answers"))).toEqual([
        expect.stringContaining("0a0b0a"),
      ]);
      expect(await listedFlags()).toEqual({
        "0a0b0a": true,
        "0a0b0b": false,
        "0a0b0c": false,
        "0a0b0d": false,
        "0a0b0e": false,
      });
    });
  });

  describe("halonic runs show", () => {
    it("says it on its own line before the ending, and in --json", async () => {
      await storeRuns(acmeRuns, finishedWith("a", ["scripted"]));

      const stdout = await runs("show", "0a0b0a");
      const json = JSON.parse((await runs("show", "0a0b0a", "--json")).join("\n")) as {
        readonly sampleAnswers: unknown;
      };

      expect(stdout).toEqual([
        "Support reply in Acme · run 0a0b0a · started 10:20, finished 10:20",
        "",
        sampleLine,
        "",
        "✓ Support reply finished in 18 s.",
        "  Sent nothing",
        "  Ending: Draft a reply",
      ]);
      expect(json.sampleAnswers).toBe(true);
    });

    it("says nothing for a run on a real model", async () => {
      await storeRuns(acmeRuns, finishedWith("b", ["scripted", "claude"]));

      const stdout = await runs("show", "0a0b0b");

      expect(stdout).not.toContain(sampleLine);
    });
  });
});
