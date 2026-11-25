import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.template-file", () => {
  it("reads a template with a title, its file name as the id and its text trimmed", () => {
    const text = yaml(
      "---",
      "title: Task with Done when",
      "---",
      "",
      "## Goal",
      "",
      "Done when: …",
    );
    expect(parsedValue("template", text, "task-spec")).toEqual({
      id: "task-spec",
      title: "Task with Done when",
      body: "## Goal\n\nDone when: …",
    });
  });

  it("reads a file without front matter as its whole text, trimmed, with Windows line breaks as \\n", () => {
    expect(parsedValue("template", "## Summary\r\n\r\nWhat changed.\r\n", "pr-body")).toEqual({
      id: "pr-body",
      body: "## Summary\n\nWhat changed.",
    });
  });

  it("refuses an empty text, a hidden mark and a key in the text", () => {
    expect(summary(problemsOf("template", yaml("---", "title: Empty", "---"), "empty"))).toEqual([
      "body too_small 4",
    ]);
    expect(summary(problemsOf("template", "Fill in\u200b this.", "hidden"))).toEqual([
      "body custom 1",
    ]);
    const leaky = `Use sk-ant-api03-${"Q7x2Lm9K".repeat(4)} to sign in.`;
    expect(summary(problemsOf("template", leaky, "leaky"))).toEqual([
      "body value-looks-like-key 1",
    ]);
  });
});
