import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** A made-up key in a known key format, built at run time so no key-shaped text sits in the repo. */
const fakeKey = `sk-${"Q7x2Lm9K".repeat(4)}`;

/** A whole tool file, from the issue-tracker example the guide uses. */
const prStatus = yaml(
  "name: pr_status",
  "description: Show a pull request's checks and whether it can merge.",
  "action: github.pull-request-status",
  "callers:",
  "  agents: [reviewer, clerk]",
  "parameters:",
  "  pr:",
  "    type: integer",
  "    description: The pull request number.",
  "    required: true",
  "  view:",
  "    type: string",
  "    description: How much to show.",
  "    choices: [short, full]",
);

/** A minimal tool file with extra lines after it. */
function toolWith(...lines: string[]): string {
  return yaml("name: pr_status", "description: Show a PR.", "action: github.pr-status", ...lines);
}

verifies("format.tool-file", () => {
  it("reads a whole tool and fills in the defaults", () => {
    expect(parsedValue("tool", prStatus)).toEqual({
      version: 1,
      name: "pr_status",
      description: "Show a pull request's checks and whether it can merge.",
      action: "github.pull-request-status",
      callers: { everyone: false, agents: ["reviewer", "clerk"] },
      parameters: {
        pr: { type: "integer", description: "The pull request number.", required: true },
        view: {
          type: "string",
          description: "How much to show.",
          required: false,
          choices: ["short", "full"],
        },
      },
    });
  });

  it("turns a tool without callers off: nobody may call it", () => {
    expect(parsedValue("tool", toolWith()).callers).toEqual({ everyone: false, agents: [] });
  });

  describe("refuses an unknown key", () => {
    it.each([
      ["at the top", toolWith("handler: ./run.js"), " unrecognized_keys 4"],
      ["in callers", toolWith("callers:", "  roles: [admin]"), "callers unrecognized_keys 5"],
      [
        "in a parameter",
        toolWith("parameters:", "  pr:", "    type: integer", "    description: n", "    min: 1"),
        "parameters.pr unrecognized_keys 8",
      ],
    ])("%s", (_where, text, expected) => {
      expect(summary(problemsOf("tool", text))).toEqual([expected]);
    });
  });

  it.each([
    ["a name in capitals", yaml("name: PR-Status", "description: d", "action: a.b"), "name"],
    ["an action without a dot", yaml("name: n", "description: d", "action: status"), "action"],
    [
      "a parameter of type object",
      toolWith("parameters:", "  pr:", "    type: object", "    description: n"),
      "parameters.pr.type",
    ],
    [
      "a description over two lines",
      yaml("name: n", 'description: "a\\nb"', "action: a.b"),
      "description",
    ],
    [
      "a right-to-left override",
      yaml("name: n", 'description: "a\\u202Eb"', "action: a.b"),
      "description",
    ],
  ])("refuses %s", (_what, text, path) => {
    expect(problemsOf("tool", text).map((problem) => problem.path.join("."))).toEqual([path]);
  });

  it("refuses callers that are both everyone and a list", () => {
    const text = toolWith("callers:", "  everyone: true", "  agents: [clerk]");
    expect(summary(problemsOf("tool", text))).toEqual(["callers tool-callers-both 5"]);
  });

  it("refuses choices on a parameter that isn't text", () => {
    const text = toolWith(
      "parameters:",
      "  pr:",
      "    type: integer",
      "    description: n",
      "    choices: ['1']",
    );
    expect(summary(problemsOf("tool", text))).toEqual([
      "parameters.pr.choices tool-choices-not-text 8",
    ]);
  });

  it("refuses more than 20 parameters", () => {
    const parameters = Array.from(
      { length: 21 },
      (_, index) => `  p${index}: { type: string, description: n }`,
    );
    const text = toolWith("parameters:", ...parameters);
    expect(summary(problemsOf("tool", text))).toEqual(["parameters tool-too-many-parameters 5"]);
  });

  it.each([
    [
      "the description",
      yaml("name: n", `description: Use ${fakeKey}`, "action: a.b"),
      "description",
    ],
    [
      "a parameter's description",
      toolWith("parameters:", "  repo:", "    type: string", `    description: ${fakeKey}`),
      "parameters.repo.description",
    ],
    [
      "a choice",
      toolWith(
        "parameters:",
        "  repo:",
        "    type: string",
        "    description: n",
        `    choices: [${fakeKey}]`,
      ),
      "parameters.repo.choices.0",
    ],
  ])("refuses a key in %s, without repeating it", (_where, text, path) => {
    const problems = problemsOf("tool", text);
    expect(problems.map((problem) => `${problem.path.join(".")} ${problem.code}`)).toEqual([
      `${path} value-looks-like-key`,
    ]);
    expect(JSON.stringify(problems)).not.toContain(fakeKey);
  });

  describe("refuses a character a person can't see", () => {
    it.each([
      ["a zero-width space (U+200B)", "\\u200B"],
      ["a tag character (U+E0041)", "\\U000E0041"],
      ["a line separator (U+2028)", "\\u2028"],
      ["a byte-order mark (U+FEFF)", "\\uFEFF"],
    ])("%s in the description", (_what, escaped) => {
      const text = yaml("name: n", `description: "Show a PR.${escaped}"`, "action: a.b");
      expect(problemsOf("tool", text).map((problem) => problem.path.join("."))).toEqual([
        "description",
      ]);
    });

    it("in a choice, which agents read too", () => {
      const text = toolWith(
        "parameters:",
        "  view:",
        "    type: string",
        "    description: n",
        '    choices: ["short\\U000E0041"]',
      );
      expect(problemsOf("tool", text).map((problem) => problem.path.join("."))).toEqual([
        "parameters.view.choices.0",
      ]);
    });
  });

  it.each(["constructor", "toString", "valueOf", "hasOwnProperty"])(
    "refuses %s as a parameter name, which every object already has",
    (name) => {
      const text = toolWith("parameters:", `  ${name}: { type: string, description: n }`);
      expect(problemsOf("tool", text).map((problem) => problem.path.join("."))).toEqual([
        `parameters.${name}`,
      ]);
    },
  );

  it("refuses a parameter name that is a key, without repeating it", () => {
    const keyName = `ghp_${"a1B2c3D4e5".repeat(3)}a1B2c3`;
    const text = toolWith("parameters:", `  ${keyName}: { type: string, description: n }`);
    const problems = problemsOf("tool", text);
    expect(problems.map((problem) => problem.code)).toEqual(["value-looks-like-key"]);
    expect(problems.map((problem) => problem.message).join(" ")).not.toContain(keyName);
  });
});
