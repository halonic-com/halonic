import { describe, expect, test } from "vitest";
import { requirementIdPattern, verifies } from "./verifies.ts";

let nestedError: unknown;

verifies("spec.verifies-tags-tests", () => {
  test("names the group after the requirement and tags the test with its ID", ({ task }) => {
    expect(task.suite?.name).toBe("spec.verifies-tags-tests");
    expect(task.meta.requirement).toBe("spec.verifies-tags-tests");
  });

  describe("a nested describe", () => {
    test("keeps the tag on its tests", ({ task }) => {
      expect(task.meta.requirement).toBe("spec.verifies-tags-tests");
    });
  });

  try {
    verifies("spec.inner", () => {});
  } catch (error) {
    nestedError = error;
  }
});

verifies("spec.verifies-rejects-bad-ids", () => {
  test.each([
    "workflow",
    "Workflow.timer",
    "workflow.timer_fires",
    "workflow..timer",
    "workflow.timer.",
    " workflow.timer",
    "workflow/timer",
  ])("refuses %j", (id) => {
    expect(() => verifies(id, () => {})).toThrow(/is not a requirement ID/);
  });

  test("refuses a verifies() inside another one", () => {
    expect(nestedError).toBeInstanceOf(Error);
    expect((nestedError as Error).message).toMatch(/inside another verifies\(\)/);
  });
});

describe("requirementIdPattern", () => {
  test.each([
    "workflow.timer-fires-after-delay",
    "agents.explorer.filter-by-hub",
    "cli.commands.validate.exit-code-on-error",
    "schema-kit.v2-keys",
  ])("accepts %j", (id) => {
    expect(requirementIdPattern.test(id)).toBe(true);
  });
});
