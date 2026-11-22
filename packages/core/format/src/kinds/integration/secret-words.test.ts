import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { problemsOf, yaml } from "../../test/parse.spec.ts";

/** A small sheet whose one secret has the lines given. */
function sheetWithSecret(...secretLines: string[]): string {
  return yaml(
    "id: notes",
    "version: 1.0.0",
    "kit: 1",
    "provides: [connector]",
    "hosts: [api.example.com]",
    "secrets:",
    "  notes-key:",
    "    purpose: Notes API key",
    ...secretLines.map((line) => `    ${line}`),
  );
}

const addAs =
  "Add as: bearer, as: header (with header) or as: form (with field) to say how the kit sends it.";

verifies("format.integration-secret-without-as", () => {
  it("says to add as for a secret with hosts and no as", () => {
    const problems = problemsOf("integration", sheetWithSecret("hosts: [api.example.com]"));
    expect(problems).toEqual([
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["secrets", "notes-key"],
        keys: ["hosts"],
        line: 9,
        message: `Secret "notes-key" has hosts but no as, so it reads as a sign-in's client secret, which has only purpose. ${addAs}`,
      }),
    ]);
  });

  it("names every placement field in one problem, where the secret starts", () => {
    const problems = problemsOf(
      "integration",
      sheetWithSecret("hosts: [api.example.com]", "header: x-api-key", "prefix: Key"),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        path: ["secrets", "notes-key"],
        keys: ["hosts", "header", "prefix"],
        line: 8,
        message: expect.stringContaining(
          'Secret "notes-key" has hosts, header and prefix but no as',
        ),
      }),
    ]);
  });

  it("keeps the shared words for an unknown field beside it", () => {
    const messages = problemsOf("integration", sheetWithSecret("field: key", "colour: red")).map(
      (problem) => problem.message,
    );
    expect(messages).toEqual([
      expect.stringContaining('Secret "notes-key" has field but no as'),
      `There's no field "colour" in "secrets.notes-key".`,
    ]);
  });

  it("keeps the shared words for a secret that has as", () => {
    const messages = problemsOf(
      "integration",
      sheetWithSecret("hosts: [api.example.com]", "as: bearer", "header: x-api-key"),
    ).map((problem) => problem.message);
    expect(messages).toEqual([`There's no field "header" in "secrets.notes-key".`]);
  });

  it("leaves a client secret with only purpose to the sign-in checks", () => {
    const codes = problemsOf("integration", sheetWithSecret()).map((problem) => problem.code);
    expect(codes).toEqual(["client-secret-unused"]);
  });
});
