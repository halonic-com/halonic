import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  requestSkillInstructionsFocus,
  takeSkillInstructionsFocus,
} from "./skill-focus-request.ts";

verifies("library.new-skill", () => {
  it("answers a focus request once, and only for the skill it names", () => {
    requestSkillInstructionsFocus({ hub: "support", id: "refunds" });
    expect(takeSkillInstructionsFocus({ hub: null, id: "refunds" })).toBe(false);
    expect(takeSkillInstructionsFocus({ hub: "support", id: "refunds" })).toBe(true);
    expect(takeSkillInstructionsFocus({ hub: "support", id: "refunds" })).toBe(false);
  });
});
