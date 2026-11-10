import { join } from "node:path";
import { KindedError } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import type { CliCommand } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import { defineMessages } from "../messages/define.ts";
import { bold, markPart, phrase } from "../messages/phrase.ts";
import { goldenText, runGolden } from "./golden.ts";
import { checklistProblems } from "./golden-checklist.ts";

const words = defineMessages("test", {
  summary: () => phrase`Greet a workspace`,
  greeted: (name: string) => phrase`${markPart("done")} Greeted ${bold(name)}.`,
  failedOnStdout: () => phrase`${markPart("failed")} Couldn't greet Acme.`,
});

/** A command that greets the workspace its run id belongs to, or fails with `--fail`. */
function greetCommand(runId: string): CliCommand {
  return {
    name: "greet",
    usage: "[--fail]",
    summary: words.summary(),
    options: { fail: { type: "boolean", description: words.summary() } },
    async run(input) {
      if (input.options["fail"] === true) {
        throw new KindedError("not_found", "There's no workspace in ./acme.", {
          fix: "Run halonic init in ./acme first.",
        });
      }
      return { exitCode: exitCode.ok, lines: [words.greeted("Acme").phrase], json: { runId } };
    },
  };
}

/** Each mode gets a fresh command with the same fixed run id. */
const greet = () => [greetCommand("run_0001")];

describe("runGolden", () => {
  it("runs a success in every mode and keeps the checklist", async () => {
    const run = await runGolden(["greet"], greet);
    expect(run.colour.stdout[0]).toContain("\u001b[");
    expect(run.noColour.stdout).toEqual(["✓ Greeted Acme."]);
    expect(JSON.parse(run.json.stdout[0] ?? "")).toEqual({
      outputVersion: 1,
      ok: true,
      runId: "run_0001",
    });
    expect(checklistProblems(run)).toEqual([]);
  });

  it("runs an error in every mode and keeps the checklist", async () => {
    const run = await runGolden(["greet", "--fail"], greet);
    expect(run.noColour.exit).toBe(exitCode.notFound);
    expect(checklistProblems(run)).toEqual([]);
  });

  it("puts --json before a --, where the CLI reads it", async () => {
    const run = await runGolden(["greet", "--", "extra"], greet);
    expect(run.json.stdout[0]).toContain('"outputVersion": 1');
  });

  it("writes every mode to one golden file, with escape codes shown", async () => {
    const args = ["greet", "--fail"];
    const text = goldenText(args, await runGolden(args, greet));
    await expect(text).toMatchFileSnapshot(join("golden", "greet-fail.txt"));
  });
});

describe("checklistProblems", () => {
  it("finds an error line on stdout", async () => {
    const shouting: CliCommand = {
      ...greetCommand("run_0001"),
      run: async () => ({
        exitCode: exitCode.failed,
        lines: [words.failedOnStdout().phrase],
        json: {},
      }),
    };
    const problems = checklistProblems(await runGolden(["greet"], () => [shouting]));
    expect(problems).toEqual(["An error line went to stdout: ✕ Couldn't greet Acme."]);
  });

  it("finds exit codes that differ and a document that isn't ok on a failure", async () => {
    const run = await runGolden(["greet"], greet);
    const json = { ...run.json, exit: exitCode.failed };
    expect(checklistProblems({ ...run, json })).toEqual([
      "The exit code differs: 0 with colour, 0 with NO_COLOR, 1 with --json.",
      "The --json document says ok is true, but the exit code is 1.",
    ]);
  });

  it("finds colour where there should be none, and words that differ", async () => {
    const run = await runGolden(["greet"], greet);
    const noColour = { ...run.noColour, stdout: run.colour.stdout };
    const json = { ...run.json, stdout: ["not json"], stderr: ["◌ Greet Acme"] };
    expect(checklistProblems({ ...run, noColour, json })).toEqual([
      "The NO_COLOR output has escape codes.",
      "The colour output says something else than the NO_COLOR output.",
      "With --json, stderr isn't empty.",
      "With --json, stdout isn't a JSON object.",
    ]);
  });
});
