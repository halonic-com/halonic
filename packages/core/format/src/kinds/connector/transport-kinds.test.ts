import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { problemsOf, yaml } from "../../test/parse.spec.ts";

const namesTheKinds =
  "transport needs exactly one of: http, stdio, google, integration, plugin or paperclip.";

verifies("format.connector-transport-kinds", () => {
  it("names the kinds when the transport is missing, next to the field put beside it", () => {
    const problems = problemsOf("connector", yaml("id: orders", "plugin: { id: acme-orders }"));
    expect(problems.map((problem) => problem.message)).toEqual([
      namesTheKinds,
      `There's no field "plugin" in this file.`,
    ]);
  });

  it("names the kinds when the transport names two of them", () => {
    const twoKinds = yaml(
      "id: orders",
      "transport:",
      "  http: { url: 'https://tracker.example.com' }",
      "  plugin: { id: acme-orders }",
    );
    expect(problemsOf("connector", twoKinds)).toEqual([
      expect.objectContaining({ path: ["transport"], message: namesTheKinds }),
    ]);
  });

  it("keeps the problem of a mistake inside one kind", () => {
    const misspelt = yaml("id: orders", "transport:", "  plugin: { idd: acme-orders }");
    const [problem] = problemsOf("connector", misspelt);
    expect(problem?.path).toEqual(["transport"]);
    expect(problem?.message).not.toBe(namesTheKinds);
  });
});
