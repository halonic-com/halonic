import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pageWords } from "./page-words.ts";

verifies("workflows.page.step-card", () => {
  it("titles a step's card with its name as the canvas shows it, with no Step before it", () => {
    expect(pageWords.stepCard.title({ id: "step-1" })).toBe("step-1");
    expect(pageWords.stepCard.title({ id: "write", title: "Writes the answer" })).toBe(
      "Writes the answer",
    );
  });
});
