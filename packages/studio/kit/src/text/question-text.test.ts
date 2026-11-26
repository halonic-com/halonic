import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { questionBody, questionTitle } from "./question-text.ts";

verifies("kit.question-text", () => {
  it("takes the title from the first block, its marks read and not shown", () => {
    expect(questionTitle("# **Hire** an agent\n\nIris, designer")).toBe("Hire an agent");
    expect(questionTitle("- _First_ point\n- Second point")).toBe("First point");
    expect(questionTitle("Read [the plan](https://acme.example/plan)")).toBe("Read the plan");
    expect(questionTitle("```\npnpm test\n```")).toBe("pnpm test");
    expect(questionTitle("")).toBe("");
  });

  it("leaves the title's line out of the body, and keeps a first line with a link or code", () => {
    expect(questionBody("New secret: ACME_TOKEN\n\n- Key: ACME_TOKEN")).toBe("- Key: ACME_TOKEN");
    expect(questionBody("# **Hire** an agent\n\nIris, designer")).toBe("Iris, designer");
    expect(questionBody("Two open decisions")).toBe("");
    const linked = "Read [the plan](https://acme.example/plan)\n\nThen answer.";
    expect(questionBody(linked)).toBe(linked);
    const code = "```\npnpm test\n```\n\nRun it?";
    expect(questionBody(code)).toBe(code);
    expect(questionBody("")).toBe("");
  });
});
