# @halonicjs/testing-spec

Links tests to requirement IDs with verifies(), and records which requirements ran and passed.

- **Layer:** testing
- **Owner:** julian
- **Public API:** `verifies`, `requirementIdPattern`

`verifies(id, body)` is `describe` with the requirement ID as its title. It
also tags every test inside with the ID, and Vitest writes that tag into its
result file, so `pnpm check trace` can see which requirements have tests that
ran and passed. Use one `verifies` per requirement; they don't nest.

The requirement itself lives in a file next to the code, for example
`packages/core/workflow/requirements/timer-fires-after-delay.md` for the ID
`workflow.timer-fires-after-delay`.

## Example

This is [`examples/link-a-test-to-a-requirement.ts`](examples/link-a-test-to-a-requirement.ts), which `src/example.test.ts` runs. The file imports from `../src/index.ts` because a package can't import itself by name; in your own package, import from `@halonicjs/testing-spec`.

```ts
import { expect, test } from "vitest";
import { requirementIdPattern, verifies } from "@halonicjs/testing-spec";

// Call this at the top level of a test file, with the ID from the requirement file.
export function declareTests(requirementId: string): void {
  verifies(requirementId, () => {
    test("is tagged with its requirement", ({ task }) => {
      expect(task.meta.requirement).toBe(requirementId);
    });
  });
}

// requirementIdPattern is the same check verifies() makes on its ID.
export function runExample() {
  let badIdMessage = "";
  try {
    verifies("Timer_Fires", () => {});
  } catch (error) {
    badIdMessage = (error as Error).message;
  }
  return {
    goodId: requirementIdPattern.test("workflow.timer-fires-after-delay"),
    badId: requirementIdPattern.test("Timer_Fires"),
    badIdMessage, // "Timer_Fires" is not a requirement ID. Use <package>[.<sub-feature>].<name> …
  };
}
```

Add the package as a `devDependency` (`"@halonicjs/testing-spec": "workspace:*"`).
