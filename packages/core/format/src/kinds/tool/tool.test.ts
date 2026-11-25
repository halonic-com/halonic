import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { toolActionInfo, toolActionNames } from "./actions.ts";

/** A tool file that passes, with `extra` lines added at the end. */
function toolFile(...extra: string[]): string {
  return yaml(
    "id: pr-status",
    "name: pr_status",
    "description: Reads one pull request's checks and queue state.",
    "callers: everyone",
    "action:",
    "  run: github.pull-request",
    "  with: { repositories: [acme/website] }",
    ...extra,
  );
}

/** The same tool with its own `parameters` block. */
function withParameters(...lines: string[]): string {
  return toolFile("parameters:", ...lines.map((line) => `  ${line}`));
}

verifies("format.tool-file", () => {
  it("reads a tool and fills in version and parameters", () => {
    expect(parsedValue("tool", toolFile())).toEqual({
      version: 1,
      id: "pr-status",
      name: "pr_status",
      description: "Reads one pull request's checks and queue state.",
      parameters: {},
      callers: "everyone",
      action: { run: "github.pull-request", with: { repositories: ["acme/website"] } },
    });
  });

  it("fills in required and maxLength for each parameter", () => {
    const value = parsedValue(
      "tool",
      withParameters(
        "pr: { type: integer, description: The pull request's number., required: true, minimum: 1 }",
        "repo: { type: string, description: Which repository., enum: [acme/website] }",
      ),
    );
    expect(value.parameters).toEqual({
      pr: {
        type: "integer",
        description: "The pull request's number.",
        required: true,
        minimum: 1,
      },
      repo: {
        type: "string",
        description: "Which repository.",
        required: false,
        enum: ["acme/website"],
        maxLength: 1000,
      },
    });
  });

  it("takes callers as a list of agents", () => {
    const text = toolFile().replace(
      "callers: everyone",
      "callers: { agents: [Builder, Reviewer] }",
    );
    expect(parsedValue("tool", text).callers).toEqual({ agents: ["Builder", "Reviewer"] });
  });

  it("refuses a file without callers: nobody is allowed by default", () => {
    const text = toolFile().replace("callers: everyone\n", "");
    expect(summary(problemsOf("tool", text))).toEqual(["callers invalid_union 1"]);
  });

  it("refuses unknown keys at the top, in a parameter and in an action's settings", () => {
    expect(summary(problemsOf("tool", toolFile("script: run.js")))).toEqual([
      " unrecognized_keys 8",
    ]);
    expect(
      summary(
        problemsOf(
          "tool",
          withParameters("pr: { type: integer, description: Number., default: 1 }"),
        ),
      ),
    ).toEqual(["parameters.pr unrecognized_keys 9"]);
    const settings = toolFile().replace("[acme/website] }", "[acme/website], host: evil.example }");
    expect(summary(problemsOf("tool", settings))).toEqual(["action.with unrecognized_keys 7"]);
  });

  it("refuses a nested parameter type", () => {
    const text = withParameters("filter: { type: object, description: Anything. }");
    expect(summary(problemsOf("tool", text))).toEqual(["parameters.filter.type invalid_union 9"]);
  });

  it("refuses a tool name, parameter name or repository in another form", () => {
    expect(
      summary(problemsOf("tool", toolFile().replace("name: pr_status", "name: PR-Status"))),
    ).toEqual(["name invalid_format 2"]);
    expect(
      summary(problemsOf("tool", withParameters("Pr: { type: boolean, description: Yes. }"))),
    ).toEqual(["parameters.Pr invalid_key 9"]);
    const repository = toolFile().replace("acme/website", "https://github.com/acme/website");
    expect(summary(problemsOf("tool", repository))).toEqual([
      "action.with.repositories.0 invalid_format 7",
    ]);
  });

  it("refuses more than 16 parameters", () => {
    const many = Array.from(
      { length: 17 },
      (_, index) => `p${index}: { type: boolean, description: Yes. }`,
    );
    expect(summary(problemsOf("tool", withParameters(...many)))).toEqual(["parameters custom 9"]);
  });

  it("refuses a control character or text-direction mark in the description", () => {
    const text = toolFile().replace("Reads one", "Reads\u202E one");
    expect(summary(problemsOf("tool", text))).toEqual(["description custom 3"]);
  });
});

verifies("format.tool-actions", () => {
  it("lists the read-only actions, each with the keys it needs", () => {
    expect(
      toolActionNames().map((name) => `${name} ${toolActionInfo(name).keys.join(",")}`),
    ).toEqual([
      "github.pull-request github-read",
      "github.open-pull-requests github-read",
      "github.merge-queue github-read",
      "github.merge-times github-read",
      "paperclip.task paperclip-api",
      "paperclip.failed-runs paperclip-api",
    ]);
    expect(toolActionNames().some((name) => toolActionInfo(name).writes)).toBe(false);
  });

  it("refuses an action the runtime doesn't have", () => {
    const text = toolFile().replace("github.pull-request", "shell.run");
    expect(summary(problemsOf("tool", text))).toEqual(["action.run invalid_union 6"]);
  });

  it("refuses a GitHub action without its repositories, and fills in the others' defaults", () => {
    const text = toolFile().replace("  with: { repositories: [acme/website] }\n", "");
    expect(summary(problemsOf("tool", text))).toEqual(["action.with invalid_type 5"]);
    const task = toolFile()
      .replace("github.pull-request", "paperclip.failed-runs")
      .replace("  with: { repositories: [acme/website] }\n", "");
    expect(parsedValue("tool", task).action).toEqual({
      run: "paperclip.failed-runs",
      with: { hours: 24 },
    });
  });
});
