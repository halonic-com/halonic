import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { toolActionInfo, toolActionNames } from "./actions.ts";

/**
 * A tool file that passes, with `extra` lines added at the end. Its action
 * reads no parameters, so it passes without any.
 */
function toolFile(...extra: string[]): string {
  return yaml(
    "id: my-prs",
    "name: my_prs",
    "description: Lists the caller's open pull requests.",
    "callers: everyone",
    "action:",
    "  run: github.open-pull-requests",
    "  with: { repositories: [acme/website] }",
    ...extra,
  );
}

/** A `github.pull-request` tool with its own `parameters` block: that action reads `pr` and `repo`. */
function withParameters(...lines: string[]): string {
  return toolFile("parameters:", ...lines.map((line) => `  ${line}`)).replace(
    "github.open-pull-requests",
    "github.pull-request",
  );
}

verifies("format.tool-file", () => {
  it("reads a tool and fills in version and parameters", () => {
    expect(parsedValue("tool", toolFile())).toEqual({
      version: 1,
      id: "my-prs",
      name: "my_prs",
      description: "Lists the caller's open pull requests.",
      parameters: {},
      callers: "everyone",
      action: { run: "github.open-pull-requests", with: { repositories: ["acme/website"] } },
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

  it("refuses an object without fields, a list without items, and anything nested deeper", () => {
    const refused = (line: string) => summary(problemsOf("tool", withParameters(line)));
    expect(refused("filter: { type: object, description: Anything. }")).toEqual([
      "parameters.filter.fields invalid_type 9",
    ]);
    expect(refused("filter: { type: object, description: Anything., fields: {} }")).toEqual([
      "parameters.filter.fields custom 9",
    ]);
    expect(refused("tags: { type: list, description: Tags. }")).toEqual([
      "parameters.tags.items invalid_type 9",
    ]);
    const deeper =
      "filter: { type: object, description: A., fields: { inner: { type: list, description: B., items: { type: string } } } }";
    expect(refused(deeper)).toEqual(["parameters.filter.fields.inner.type invalid_union 9"]);
    expect(refused("tags: { type: list, description: Tags., items: { type: object } }")).toEqual([
      "parameters.tags.items.type invalid_union 9",
    ]);
  });

  it("refuses a tool name, parameter name or repository in another form", () => {
    expect(summary(problemsOf("tool", toolFile().replace("name: my_prs", "name: My-PRs")))).toEqual(
      ["name invalid_format 2"],
    );
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
    const text = toolFile().replace("Lists the", "Lists\u202E the");
    expect(summary(problemsOf("tool", text))).toEqual(["description custom 3"]);
  });
});

verifies("format.tool-actions", () => {
  it("lists the actions, each with the keys it needs, and only the Paperclip writers write", () => {
    expect(
      toolActionNames().map((name) => `${name} ${toolActionInfo(name).keys.join(",")}`),
    ).toEqual([
      "github.pull-request github-read",
      "github.open-pull-requests github-read",
      "github.merge-queue github-read",
      "github.merge-times github-read",
      "paperclip.task paperclip-api",
      "paperclip.failed-runs paperclip-api",
      "paperclip.budgets paperclip-api",
      "paperclip.seat-rules paperclip-api",
      "paperclip.template ",
      "paperclip.comment paperclip-api",
      "paperclip.next-step paperclip-api",
      "paperclip.finish-run paperclip-api",
      "paperclip.propose-budget paperclip-api",
      "halonic.precheck ",
    ]);
    expect(toolActionNames().filter((name) => toolActionInfo(name).writes)).toEqual([
      "paperclip.comment",
      "paperclip.next-step",
      "paperclip.finish-run",
    ]);
  });

  it("starts a budget proposal in dry run, with no budgets until the tool file gives some", () => {
    const propose = toolFile()
      .replace("github.open-pull-requests", "paperclip.propose-budget")
      .replace("  with: { repositories: [acme/website] }\n", "");
    expect(parsedValue("tool", propose).action).toEqual({
      run: "paperclip.propose-budget",
      with: { mode: "dry-run", agents: {}, projects: {} },
    });
  });

  it("refuses an action the runtime doesn't have", () => {
    const text = toolFile().replace("github.open-pull-requests", "shell.run");
    expect(summary(problemsOf("tool", text))).toEqual(["action.run invalid_union 6"]);
  });

  it("starts a writing action in dry run, and refuses a mode it doesn't know", () => {
    const comment = toolFile(
      "parameters:",
      "  task: { type: string, description: The task., required: true }",
      "  body: { type: string, description: The comment., required: true }",
    )
      .replace("github.open-pull-requests", "paperclip.comment")
      .replace("  with: { repositories: [acme/website] }\n", "");
    expect(parsedValue("tool", comment).action).toEqual({
      run: "paperclip.comment",
      with: { mode: "dry-run" },
    });
    const unknown = toolFile()
      .replace("github.open-pull-requests", "paperclip.comment")
      .replace("{ repositories: [acme/website] }", "{ mode: always }");
    expect(summary(problemsOf("tool", unknown))).toEqual(["action.with.mode invalid_value 7"]);
  });

  it("refuses a budget list without its agents, or with a budget in fractions of a cent", () => {
    const budgets = toolFile().replace("github.open-pull-requests", "paperclip.budgets");
    const none = budgets.replace("  with: { repositories: [acme/website] }\n", "");
    expect(summary(problemsOf("tool", none))).toEqual(["action.with invalid_type 5"]);
    const cents = budgets.replace(
      "{ repositories: [acme/website] }",
      "{ agents: { mateo: 12.5 } }",
    );
    expect(parsedValue("tool", cents).action).toEqual({
      run: "paperclip.budgets",
      with: { agents: { mateo: 12.5 }, projects: {} },
    });
    const projects = budgets.replace(
      "{ repositories: [acme/website] }",
      "{ agents: {}, projects: { website: 80 } }",
    );
    expect(parsedValue("tool", projects).action).toEqual({
      run: "paperclip.budgets",
      with: { agents: {}, projects: { website: 80 } },
    });
    const fraction = budgets.replace(
      "{ repositories: [acme/website] }",
      "{ agents: { mateo: 12.345 } }",
    );
    expect(summary(problemsOf("tool", fraction))).toEqual(["action.with.agents.mateo custom 7"]);
    const projectFraction = budgets.replace(
      "{ repositories: [acme/website] }",
      "{ agents: {}, projects: { website: 12.345 } }",
    );
    expect(summary(problemsOf("tool", projectFraction))).toEqual([
      "action.with.projects.website custom 7",
    ]);
  });

  it("refuses a GitHub action without its repositories, and fills in the others' defaults", () => {
    const text = toolFile().replace("  with: { repositories: [acme/website] }\n", "");
    expect(summary(problemsOf("tool", text))).toEqual(["action.with invalid_type 5"]);
    const task = toolFile()
      .replace("github.open-pull-requests", "paperclip.failed-runs")
      .replace("  with: { repositories: [acme/website] }\n", "");
    expect(parsedValue("tool", task).action).toEqual({
      run: "paperclip.failed-runs",
      with: { hours: 24 },
    });
  });
});
