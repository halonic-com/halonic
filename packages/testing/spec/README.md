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

```ts
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";

verifies("workflow.timer-fires-after-delay", () => {
  test("fires once the delay has passed", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Add the package as a `devDependency` (`"@halonicjs/testing-spec": "workspace:*"`).
