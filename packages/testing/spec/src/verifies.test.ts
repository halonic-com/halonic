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

verifies("spec.verifies-counts-assertions", () => {
  // The last test reads the tags of the two before it, so they keep their order.
  describe("in order", { shuffle: false }, () => {
    test("global expect", () => {
      expect(1).toBe(1);
      expect.soft(2).toBe(2);
      expect(3).toBeTruthy();
    });

    test("the test's own expect", ({ expect: own }) => {
      own(1).toBe(1);
    });

    test("records each test's expect count in its tag", ({ task }) => {
      const countOf = (name: string): number | undefined =>
        task.suite?.tasks.find((sibling) => sibling.name === name)?.meta.assertions;
      expect(countOf("global expect")).toBe(3);
      expect(countOf("the test's own expect")).toBe(1);
    });
  });
});
