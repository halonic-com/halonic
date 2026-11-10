import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { detailsOf } from "./copy-details-words.ts";

verifies("shell.page-stopped", () => {
  it("puts what stopped first, then the error's name, message and stack", () => {
    const error = new TypeError("steps is undefined");
    error.stack = "TypeError: steps is undefined\n    at WorkflowPage (workflow-page.tsx:12:3)";
    expect(detailsOf("This page stopped working: Support reply", error)).toBe(
      "This page stopped working: Support reply\nTypeError: steps is undefined\n    at WorkflowPage (workflow-page.tsx:12:3)",
    );
  });

  it("adds the name and message when the stack leaves them out, and has none without a stack", () => {
    const withoutHeadline = new Error("lost");
    withoutHeadline.stack = "    at somewhere";
    expect(detailsOf("Stopped", withoutHeadline)).toBe("Stopped\nError: lost\n    at somewhere");

    const withoutStack = new RangeError("too far");
    Reflect.deleteProperty(withoutStack, "stack");
    expect(detailsOf("Stopped", withoutStack)).toBe("Stopped\nRangeError: too far");
  });

  it("names something thrown that isn't an error", () => {
    expect(detailsOf("Stopped", "a string")).toBe("Stopped\nThrown: a string");
    expect(detailsOf("Stopped", undefined)).toBe("Stopped\nThrown: undefined");
  });
});
