import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, yaml } from "../../test/parse.spec.ts";

/** A `deployments.yaml` whose deployment `web` has `mode` and an `exposed` list of `lines`. */
function exposed(mode: string, ...lines: string[]): string {
  return yaml(
    "deployments:",
    "  web:",
    "    name: Web",
    "    users:",
    `      mode: ${mode}`,
    "      exposed:",
    ...lines.map((line) => `        ${line}`),
  );
}

/** The codes and paths of a file's problems. */
function codesOf(text: string): unknown[] {
  return problemsOf("deployments", text).map(({ code, path }) => ({ code, path }));
}

verifies("format.deployments-users-exposed", () => {
  it("reads a full entry as written", () => {
    const text = exposed(
      "many",
      "- workflow: support-reply",
      "  name: Ask support",
      "  description: Answers a question about your order.",
      "  kind: chat",
      "  inputs:",
      "    question: { label: Your question, help: One or two lines. }",
      "  shows:",
      "    answers: [reply]",
      "    results: [summary]",
      '    approvals: { "shop/refund": "Refund {amount} to {customer}?" }',
    );
    expect(parsedValue("deployments", text).deployments["web"]?.users?.exposed).toEqual([
      {
        workflow: "support-reply",
        name: "Ask support",
        description: "Answers a question about your order.",
        kind: "chat",
        inputs: { question: { label: "Your question", help: "One or two lines." } },
        shows: {
          answers: ["reply"],
          results: ["summary"],
          approvals: { "shop/refund": "Refund {amount} to {customer}?" },
        },
      },
    ]);
  });

  it("shows nothing for an entry without inputs or shows", () => {
    const text = exposed("many", "- { workflow: intake, name: Intake, kind: form }");
    expect(parsedValue("deployments", text).deployments["web"]?.users?.exposed).toEqual([
      {
        workflow: "intake",
        name: "Intake",
        kind: "form",
        inputs: {},
        shows: { answers: [], results: [], approvals: {} },
      },
    ]);
  });

  it("refuses exposed on an owner deployment", () => {
    const text = exposed("owner", "- { workflow: intake, name: Intake, kind: form }");
    expect(codesOf(text)).toEqual([
      { code: "users-exposed-needs-many", path: ["deployments", "web", "users", "exposed"] },
    ]);
  });

  it.each([
    ["another key", "- { workflow: intake, name: Intake, kind: form, everything: true }"],
    [
      "a wildcard answer",
      '- { workflow: intake, name: Intake, kind: form, shows: { answers: ["*"] } }',
    ],
    [
      "a tool without its connector",
      '- { workflow: intake, name: Intake, kind: form, shows: { approvals: { refund: "Go?" } } }',
    ],
    [
      "an empty approval text",
      '- { workflow: intake, name: Intake, kind: form, shows: { approvals: { "shop/refund": "" } } }',
    ],
    ["a name too long", `- { workflow: intake, name: ${"n".repeat(81)}, kind: form }`],
    ["an unknown kind", "- { workflow: intake, name: Intake, kind: page }"],
  ])("refuses %s", (_case, line) => {
    expect(problemsOf("deployments", exposed("many", line)).length).toBeGreaterThan(0);
  });
});
