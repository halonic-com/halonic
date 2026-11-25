import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { toolActionInfo } from "./actions.ts";

/** A `paperclip.next-step` tool with these lines under `parameters`. */
function nextStepTool(...parameters: string[]): string {
  return yaml(
    "id: acme-next-step",
    "name: set_next_step",
    "description: Keeps the caller's task in a state Paperclip accepts.",
    "callers: everyone",
    "action: { run: paperclip.next-step }",
    "parameters:",
    ...parameters.map((line) => `  ${line}`),
  );
}

/** The flat parameters `paperclip.next-step` requires, declared as it reads them. */
const requiredLines = [
  "task: { type: string, description: The task., required: true }",
  "status: { type: string, description: The next state., required: true, enum: [in_progress, blocked] }",
  "comment: { type: string, description: What happened., required: true }",
];

/** `monitor` as the action reads it, with these field lines. */
function monitorLine(...fields: string[]): string {
  return `monitor: { type: object, description: When to wake you., fields: { ${fields.join(", ")} } }`;
}

const monitorFields = [
  "inMinutes: { type: integer, description: Minutes until the check., required: true, minimum: 15 }",
  "ref: { type: string, description: What you wait on., required: true }",
  "service: { type: string, description: Where it runs. }",
  "maxChecks: { type: integer, description: How many checks., maximum: 8 }",
];

const blockedByLine =
  "blockedBy: { type: list, description: The tasks that hold the work., items: { type: string, maxLength: 40 }, maxItems: 10 }";

verifies("format.tool-file", () => {
  it("reads an object parameter with its fields and a list parameter with its items", () => {
    const tool = parsedValue(
      "tool",
      nextStepTool(
        ...requiredLines,
        monitorLine(...monitorFields),
        "blockedBy: { type: list, description: The tasks., items: { type: string } }",
      ),
    );
    expect(tool.parameters["monitor"]).toMatchObject({
      type: "object",
      required: false,
      fields: {
        inMinutes: { type: "integer", required: true, minimum: 15 },
        service: { type: "string", required: false, maxLength: 1000 },
      },
    });
    expect(tool.parameters["blockedBy"]).toEqual({
      type: "list",
      description: "The tasks.",
      required: false,
      items: { type: "string", maxLength: 1000 },
      maxItems: 20,
    });
  });
});

verifies("format.tool-parameter-shapes", () => {
  it("records monitor as an object and blockedBy as a list of strings or a text", () => {
    const shapes = toolActionInfo("paperclip.next-step").parameters.map(
      ({ name, shape }) => `${name} ${shape?.type ?? "flat"}`,
    );
    expect(shapes).toEqual([
      "task flat",
      "status flat",
      "comment flat",
      "monitor object",
      "monitorInMinutes flat",
      "monitorRef flat",
      "monitorService flat",
      "monitorMaxChecks flat",
      "blockedBy list",
    ]);
    const blockedBy = toolActionInfo("paperclip.finish-run").parameters.at(-1);
    expect(blockedBy?.shape).toEqual({ type: "list", items: "string", orText: true });
  });

  it("takes a next-step tool with monitor as an object and blockedBy as a list of strings", () => {
    const tool = parsedValue(
      "tool",
      nextStepTool(...requiredLines, monitorLine(...monitorFields), blockedByLine),
    );
    expect(Object.keys(tool.parameters)).toEqual([
      "task",
      "status",
      "comment",
      "monitor",
      "blockedBy",
    ]);
  });

  it("takes blockedBy declared as one text with commas", () => {
    const text = nextStepTool(
      ...requiredLines,
      "blockedBy: { type: string, description: The tasks with commas between them. }",
    );
    expect(parsedValue("tool", text).parameters["blockedBy"]?.type).toBe("string");
  });

  it("refuses a required parameter declared as optional, naming the action and the parameter", () => {
    const text = nextStepTool(
      "task: { type: string, description: The task. }",
      ...requiredLines.slice(1),
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual(["parameters.task.required parameter-optional 7"]);
    expect(problems[0]?.message).toContain("paperclip.next-step");
    expect(problems[0]?.message).toContain("'task'");
    expect(problems[0]?.message).toContain("required: true");
  });

  it("refuses monitor and blockedBy declared with another type", () => {
    const text = nextStepTool(
      ...requiredLines,
      "monitor: { type: string, description: When to wake you. }",
      "blockedBy: { type: list, description: The tasks., items: { type: integer } }",
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual([
      "parameters.monitor.type parameter-type 10",
      "parameters.blockedBy.type parameter-type 11",
    ]);
    expect(problems[0]?.message).toContain("an object (type object)");
    expect(problems[1]?.message).toContain(
      "a list of string (type list) or one text with commas (type string)",
    );
  });

  it("refuses an object or list where the action reads a flat value", () => {
    const text = nextStepTool(
      "task: { type: list, description: The task., required: true, items: { type: string } }",
      ...requiredLines.slice(1),
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual(["parameters.task.type parameter-type 7"]);
    expect(problems[0]?.message).toContain("type string, integer, number or boolean");
  });

  it("checks an object's fields as it checks parameters", () => {
    const text = nextStepTool(
      ...requiredLines,
      monitorLine(
        "inMinutes: { type: integer, description: Minutes. }",
        "where: { type: string, description: Where. }",
      ),
    );
    const problems = problemsOf("tool", text);
    expect(summary(problems)).toEqual([
      "parameters.monitor.fields parameter-missing 10",
      "parameters.monitor.fields.where parameter-not-read 10",
      "parameters.monitor.fields.inMinutes.required parameter-optional 10",
    ]);
    expect(problems[0]?.message).toContain("'monitor.ref'");
    expect(problems[1]?.message).toContain("'monitor.inMinutes', 'monitor.ref'");
    expect(problems[2]?.message).toContain("'monitor.inMinutes'");
  });

  it("refuses a field that asks for a key and a list item range that holds nothing", () => {
    const text = nextStepTool(
      ...requiredLines,
      monitorLine(...monitorFields, "apiKey: { type: string, description: A key. }"),
      "blockedBy: { type: list, description: The tasks., items: { type: integer, minimum: 9, maximum: 1 } }",
    );
    expect(summary(problemsOf("tool", text))).toEqual([
      "parameters.monitor.fields.apiKey parameter-asks-for-key 10",
      "parameters.blockedBy.items.minimum parameter-range-empty 11",
      "parameters.monitor.fields.apiKey parameter-not-read 10",
      "parameters.blockedBy.type parameter-type 11",
    ]);
  });
});
