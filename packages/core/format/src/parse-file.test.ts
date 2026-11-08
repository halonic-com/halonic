import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "./index.ts";
import { parsedValue, problemsOf, summary, yaml } from "./test/parse.ts";

verifies("format.parse-file-positions", () => {
  it("gives every problem its path, line and column", () => {
    const text = yaml("id: clerk", "name: Clerk", "params:", "  temperature: hot");
    expect(problemsOf("agent", text)).toEqual([
      {
        severity: "error",
        source: "schema",
        code: "invalid_type",
        path: ["params", "temperature"],
        message: "Invalid input: expected number, received string",
        line: 4,
        col: 16,
      },
    ]);
  });

  it("points a missing key at the map that should hold it", () => {
    const text = yaml("aliases:", "  fast:", "    provider: mock");
    expect(summary(problemsOf("models", text))).toEqual(["aliases.fast.model invalid_type 3"]);
  });

  it("points unknown keys at their map and names them", () => {
    const text = yaml("# a comment", "id: mock", "type: mock", "colour: red", "size: 2");
    const [problem] = problemsOf("provider", text);
    expect(problem).toMatchObject({ code: "unrecognized_keys", path: [], line: 2, col: 1 });
    expect(problem?.keys).toEqual(["colour", "size"]);
  });

  it("reports YAML that doesn't parse at its line, with no path", () => {
    const text = yaml("id: invoice", "name: Invoice", "initial: start", "states: { start: [ }");
    const [problem] = problemsOf("workflow", text);
    expect(problem).toMatchObject({
      severity: "error",
      source: "syntax",
      code: "syntax",
      path: [],
    });
    expect(problem?.line).toBe(4);
  });

  it("reports YAML we don't support, such as an alias", () => {
    const text = yaml("id: &name clerk", "name: *name");
    expect(problemsOf("agent", text)).toMatchObject([{ source: "syntax", code: "unsupported" }]);
  });

  it("reads an empty file as an empty map, so the required keys are missing at line 1", () => {
    expect(summary(problemsOf("hub", ""))).toEqual(["id invalid_type 1", "name invalid_type 1"]);
  });

  it("puts a problem about a whole file that is no map at line 1", () => {
    expect(summary(problemsOf("hub", yaml("just text")))).toEqual([" invalid_type 1"]);
  });

  it("reads Windows line endings with the same lines", () => {
    const text = "id: clerk\r\nname: Clerk\r\nmaxSteps: 0\r\n";
    expect(summary(problemsOf("agent", text))).toEqual(["maxSteps too_small 3"]);
  });
});

verifies("format.id-from-place", () => {
  it("fills in the id from the place when the file has none", () => {
    expect(parsedValue("provider", yaml("type: mock"), "spare").id).toBe("spare");
  });

  it("keeps the file's own id over the place's", () => {
    expect(parsedValue("provider", yaml("id: mock", "type: mock"), "spare").id).toBe("mock");
  });

  it("checks an id from the place like one in the file", () => {
    expect(summary(problemsOf("provider", yaml("type: mock"), "Spare"))).toEqual([
      "id invalid_format 1",
    ]);
  });

  it("says when a failing id came from the file name", () => {
    const [problem] = problemsOf("provider", yaml("type: mock"), "Spare");
    expect(problem?.message).toMatch(/the id "Spare" comes from the file name\)$/);
  });

  it("leaves the message of an id in the file as it is", () => {
    const [problem] = problemsOf("provider", yaml("id: Spare", "type: mock"), "spare");
    expect(problem?.message).not.toMatch(/comes from/);
  });

  it("ignores the place for kinds that have no id of their own", () => {
    const parsed = parseFile("models", yaml("aliases: {}"), { id: "models" });
    expect(parsed.ok && parsed.value.value).toEqual({ version: 1, aliases: {} });
  });

  it("leaves a file without an id failing when no place is given", () => {
    expect(summary(problemsOf("provider", yaml("type: mock")))).toEqual(["id invalid_type 1"]);
  });
});

verifies("format.legacy-keys", () => {
  it("reads flow: in a workflow test as workflow:", () => {
    const text = yaml("flow: invoice", "cases:", "  - name: a");
    expect(parsedValue("workflowTest", text).workflow).toBe("invoice");
  });

  it("reads run.flow and run.project in a routine as run.workflow and run.hub", () => {
    const text = yaml(
      "id: hourly",
      "name: Hourly",
      "trigger: { every: 1h }",
      "run: { project: billing, flow: invoice }",
    );
    expect(parsedValue("routine", text).run).toEqual({
      hub: "billing",
      workflow: "invoice",
      input: {},
    });
  });

  it("leaves the old key as unknown when the new one is there too", () => {
    const text = yaml("flow: a", "workflow: b", "cases:", "  - name: a");
    expect(problemsOf("workflowTest", text)).toMatchObject([
      { code: "unrecognized_keys", path: [], keys: ["flow"] },
    ]);
  });

  it("doesn't rename keys in other kinds", () => {
    const text = yaml("id: clerk", "name: Clerk", "flow: invoice");
    expect(problemsOf("agent", text)).toMatchObject([
      { code: "unrecognized_keys", keys: ["flow"] },
    ]);
  });

  it("keeps a __proto__ key as data while it renames", () => {
    const text = yaml("flow: invoice", "__proto__: { polluted: true }", "cases:", "  - name: a");
    expect(problemsOf("workflowTest", text)).toMatchObject([
      { code: "unrecognized_keys", keys: ["__proto__"] },
    ]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
