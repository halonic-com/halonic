import { describe } from "vitest";

/**
 * A requirement ID: `<package>[.<sub-feature>].<name>`, each part a short
 * kebab-case word, for example `workflow.timer-fires-after-delay`.
 */
export const requirementIdPattern =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

declare module "vitest" {
  interface TaskMeta {
    /** The requirement the test proves, set by `verifies()`. The trace check reads it. */
    requirement?: string;
  }
}

// describe() runs its body at once while Vitest collects the file, so a
// plain flag is enough to notice one verifies() inside another.
let insideVerifies = false;

/**
 * Groups the tests that prove one requirement. It is `describe`
 * with the requirement ID as its title, and it tags every test inside with
 * the ID, so Vitest's result file says which requirements ran and passed.
 *
 * @param requirementId - the ID from the requirement file, such as `workflow.timer-fires-after-delay`
 * @param body - the tests, written as in `describe`
 * @throws when the ID is not a valid requirement ID, or when `verifies` is nested in another `verifies`
 *
 * @example
 * verifies("workflow.timer-fires-after-delay", () => {
 *   test("fires once the delay has passed", () => { … });
 * });
 */
export function verifies(requirementId: string, body: () => void): void {
  if (!requirementIdPattern.test(requirementId)) {
    throw new Error(
      `"${requirementId}" is not a requirement ID. Use <package>[.<sub-feature>].<name> in kebab-case, matching the requirement file's folder.`,
    );
  }
  if (insideVerifies) {
    throw new Error(
      `verifies("${requirementId}") is inside another verifies(). Each test proves one requirement, so put them side by side.`,
    );
  }
  describe(requirementId, { meta: { requirement: requirementId } }, () => {
    insideVerifies = true;
    try {
      body();
    } finally {
      insideVerifies = false;
    }
  });
}
