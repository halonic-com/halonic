import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { toolActionInfo, toolActionNames } from "./actions.ts";

/** A tool file that runs `action` with these parameter lines. */
function toolFile(action: string, ...parameters: string[]): string {
  return yaml(
    "id: acme-tool",
    "name: acme_tool",
    "description: Reads something for Acme.",
    "callers: everyone",
    `action: { run: ${action}, with: { repositories: [acme/website] } }`,
    ...(parameters.length === 0 ? [] : ["parameters:", ...parameters.map((line) => `  ${line}`)]),
  );
}

verifies("format.tool-action-parameters", () => {
  it("declares, for every action, the parameters it reads", () => {
    expect(
      toolActionNames().map((name) => {
        const parameters = toolActionInfo(name).parameters.map(
          (parameter) => `${parameter.name}${parameter.required ? "!" : "?"}`,
        );
        return `${name} ${parameters.join(",")}`;
      }),
    ).toEqual([
      "github.pull-request pr!,repo?",
      "github.open-pull-requests ",
      "github.merge-queue ",
      "github.merge-times ",
      "paperclip.task task!,comments?,document?",
      "paperclip.failed-runs since?",
      "paperclip.budgets ",
      "paperclip.seat-rules ",
      "paperclip.template id?",
      "paperclip.comment task!,body!",
      "paperclip.next-step task!,status!,comment!,monitor?,monitorInMinutes?,monitorRef?,monitorService?,monitorMaxChecks?,blockedBy?",
      "paperclip.finish-run task!,outcome!,comment!,to?,blockedBy?",
      "paperclip.propose-budget ",
      "halonic.precheck branch?,sha?,checkId?",
    ]);
  });

  it("refuses a pull-request tool with number instead of pr, naming the action and pr", () => {
    const text = toolFile(
      "github.pull-request",
      "number: { type: integer, description: The pull request., required: true }",
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual([
      "parameters parameter-missing 7",
      "parameters.number parameter-not-read 7",
    ]);
    expect(problems[0]?.message).toContain("github.pull-request");
    expect(problems[0]?.message).toContain("'pr'");
    expect(problems[1]?.message).toContain("'pr', 'repo'");
  });

  it("takes a tool that leaves out only optional parameters", () => {
    const text = toolFile(
      "paperclip.task",
      "task: { type: string, description: The task., required: true }",
    ).replace(", with: { repositories: [acme/website] }", "");
    expect(Object.keys(parsedValue("tool", text).parameters)).toEqual(["task"]);
  });

  it("refuses any parameter on an action that reads none", () => {
    const text = toolFile(
      "github.open-pull-requests",
      "repo: { type: string, description: Which repository. }",
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual(["parameters.repo parameter-not-read 7"]);
    expect(problems[0]?.message).toContain("reads no parameters");
  });
});
