import { describe, expect, it } from "vitest";
import { approvalTypes, isKnown } from "./vocabulary.ts";

describe("isKnown", () => {
  it("knows only the listed values, written exactly", () => {
    expect(isKnown(approvalTypes, "hire_agent")).toBe(true);
    expect(isKnown(approvalTypes, "hire_agnet")).toBe(false);
    expect(isKnown(approvalTypes, " hire_agent")).toBe(false);
    expect(isKnown(approvalTypes, 1)).toBe(false);
  });
});
