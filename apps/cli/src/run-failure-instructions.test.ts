import { type RunFailure, runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith, general } from "./test/run-failure-fixtures.ts";

verifies("cli.run-failed-instructions", () => {
  const refused = failedWith("instructions-not-trusted");

  /** Line 1 and line 2 of a failure, as plain words, with the user's `--dir`. */
  function wordsOf(failure: RunFailure | undefined): [string, string] {
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Change", step: "Write the file", runId: "01JD8Q", dir: "./acme" };
    const { message, fix } = runFailedLines(run, failure);
    if (fix === undefined) throw new Error("expected line 2");
    return [plainText(message.phrase), plainText(fix.phrase)];
  }

  it("says nobody trusted the agent's instructions, and the command that trusts them", () => {
    const failure = runFailureOf({ ...refused, agent: "coder", changed: false }, undefined);
    expect(wordsOf(failure)).toEqual([
      "Change failed in the step Write the file: coder didn't start, because nobody has trusted its instructions on this computer yet.",
      "Review them and trust them with halonic trust instructions coder --dir ./acme, then run again.",
    ]);
  });

  it("says the instructions changed since they were trusted", () => {
    const failure = runFailureOf({ ...refused, agent: "coder", changed: true }, undefined);
    expect(wordsOf(failure)[0]).toBe(
      "Change failed in the step Write the file: coder didn't start, because its instructions changed since they were trusted on this computer.",
    );
  });

  it("says only that they aren't trusted when the check didn't answer", () => {
    const failure = runFailureOf({ ...refused, agent: "coder" }, undefined);
    const [one, two] = wordsOf(failure);
    expect(one).toBe(
      "Change failed in the step Write the file: coder didn't start, because its instructions aren't trusted on this computer.",
    );
    expect(`${one} ${two}`).not.toMatch(/can't tell the cause|report it/u);
  });

  it("gets the general lines when the log names no agent", () => {
    expect(runFailureOf(refused, undefined)).toEqual(general);
  });
});
