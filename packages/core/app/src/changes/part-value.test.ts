import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { partValueIn } from "./part-value.ts";

const agent =
  "id: triage\nmodel: large\ntools:\n  - search\nstates:\n  classify:\n    agent: sorter\n";

verifies("app.part-value", () => {
  it("gives the value at a part", () => {
    expect(partValueIn(agent, ["model"])).toEqual({ found: true, value: "large" });
    expect(partValueIn(agent, ["tools"])).toEqual({ found: true, value: ["search"] });
  });

  it("gives a step of a workflow as a whole", () => {
    expect(partValueIn(agent, ["states", "classify"])).toEqual({
      found: true,
      value: { agent: "sorter" },
    });
  });

  it("says there is none for a part the text doesn't have", () => {
    expect(partValueIn(agent, ["sandbox"])).toEqual({ found: false });
  });

  it("says there is none for a text that is missing or doesn't read", () => {
    expect(partValueIn(null, ["model"])).toEqual({ found: false });
    expect(partValueIn(": : :\n  - [", ["model"])).toEqual({ found: false });
  });
});
