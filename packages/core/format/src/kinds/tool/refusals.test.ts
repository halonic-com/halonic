import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** An invented key in a format `findSecretShape` knows; never a real one. */
const anthropicKey = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;

/** An invented classic GitHub token; at 40 characters it fits a parameter's name. */
const githubToken = `ghp_${"Q7x2Lm9K3".repeat(4)}`;

/**
 * A tool file whose description, parameter and settings are given. Its
 * action reads only `since`, so any other parameter is also refused with
 * `parameter-not-read` (`format.tool-action-parameters`).
 */
function toolFile(parts: { description?: string; parameter?: string; agents?: string }): string {
  return yaml(
    "id: failed-runs",
    "name: failed_runs",
    `description: ${parts.description ?? "Lists the runs that failed."}`,
    "parameters:",
    `  ${parts.parameter ?? "since: { type: string, description: Since when. }"}`,
    `callers: ${parts.agents === undefined ? "everyone" : `{ agents: [${parts.agents}] }`}`,
    "action: { run: paperclip.failed-runs }",
  );
}

verifies("format.tool-refusals", () => {
  it("refuses a key in the description, without repeating it", () => {
    const problems = problemsOf("tool", toolFile({ description: `Use ${anthropicKey} to read.` }));
    expect(summary(problems)).toEqual(["description value-looks-like-key 3"]);
    expect(problems[0]?.message).not.toContain(anthropicKey);
  });

  it("refuses a key in a parameter's description or choices, and in the named callers", () => {
    const inDescription = `since: { type: string, description: "Key ${anthropicKey}" }`;
    expect(summary(problemsOf("tool", toolFile({ parameter: inDescription })))).toEqual([
      "parameters.since.description value-looks-like-key 5",
    ]);
    const inChoices = `since: { type: string, description: Which., enum: [fast, ${anthropicKey}] }`;
    expect(summary(problemsOf("tool", toolFile({ parameter: inChoices })))).toEqual([
      "parameters.since.enum.1 value-looks-like-key 5",
    ]);
    expect(summary(problemsOf("tool", toolFile({ agents: `Builder, ${anthropicKey}` })))).toEqual([
      "callers.agents.1 value-looks-like-key 6",
    ]);
  });

  it("refuses a key written as a parameter's name, without repeating it", () => {
    const parameter = `${githubToken}: { type: string, description: Pass it. }`;
    const problems = problemsOf("tool", toolFile({ parameter }));
    expect(summary(problems)).toEqual([
      `parameters.${githubToken} value-looks-like-key 5`,
      `parameters.${githubToken} parameter-not-read 5`,
    ]);
    for (const problem of problems) {
      expect(problem.message).not.toContain(githubToken);
    }
  });

  it("refuses a parameter whose name asks for a key", () => {
    for (const name of ["token", "apiKey", "githubToken", "password", "authorization"]) {
      const parameter = `${name}: { type: string, description: Pass it. }`;
      expect(summary(problemsOf("tool", toolFile({ parameter })))).toEqual([
        `parameters.${name} parameter-asks-for-key 5`,
        `parameters.${name} parameter-not-read 5`,
      ]);
    }
  });

  it("refuses invisible characters in a description and in a parameter's choices", () => {
    for (const hidden of ["\u200B", "\uFEFF", "\u{E0041}", "\u2028", "\u2029"]) {
      expect(
        summary(problemsOf("tool", toolFile({ description: `Lists${hidden} runs.` }))),
      ).toEqual(["description custom 3"]);
      const parameter = `since: { type: string, description: Which., enum: [fast, "sl${hidden}ow"] }`;
      expect(summary(problemsOf("tool", toolFile({ parameter })))).toEqual([
        "parameters.since.enum.1 custom 5",
      ]);
    }
  });

  it("refuses a parameter name every object already has", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
      const parameter = `${name}: { type: string, description: Pass it. }`;
      expect(summary(problemsOf("tool", toolFile({ parameter })))).toEqual([
        `parameters.${name} invalid_key 5`,
      ]);
    }
  });

  it("refuses a tool file over 64 KiB before parsing it", () => {
    const padding = `# ${"x".repeat(64 * 1024)}`;
    expect(summary(problemsOf("tool", `${toolFile({})}${padding}\n`))).toEqual([
      " file-too-large 1",
    ]);
  });

  it("refuses a number range that holds no value", () => {
    const parameter =
      "hours: { type: integer, description: How far back., minimum: 10, maximum: 1 }";
    expect(summary(problemsOf("tool", toolFile({ parameter })))).toEqual([
      "parameters.hours.minimum parameter-range-empty 5",
      "parameters.hours parameter-not-read 5",
    ]);
  });
});
