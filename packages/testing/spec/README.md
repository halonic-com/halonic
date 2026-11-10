# @halonicjs/testing-spec

Links tests to requirement IDs with verifies(), records which requirements ran and passed, and pins committed spec files to the code with expectSpecFile().

- **Layer:** testing
- **Owner:** julian
- **Public API:** `verifies`, `requirementIdPattern`, `typeTest`; `expectSpecFile` from `@halonicjs/testing-spec/node` (it needs Node)

`verifies(id, body)` is `describe` with the requirement ID as its title. It
also tags every test inside with the ID, and Vitest writes that tag into its
result file, so `pnpm check trace` can see which requirements have tests that
ran and passed. Use one `verifies` per requirement; they don't nest. A bad ID,
or a `verifies` inside another, throws an error that says what is wrong. The
tag also holds how many `expect` calls each test made, counting both the global
`expect` and the test's own.

`typeTest(name, body)` is `test` for a body that only checks types, for example
with `expectTypeOf`. It records one assertion, so it passes when tests must
assert. If the body calls `expect` at run time, the test fails and says to use
`it` instead.

The requirement itself lives in a file next to the code, for example
`packages/core/workflow/requirements/timer-fires-after-delay.md` for the ID
`workflow.timer-fires-after-delay`.

`expectSpecFile(path, schema)` expects the committed spec file (the JSON Schema of a public API) at `path` to hold exactly `schema`, pretty-printed as JSON with two spaces and a final newline. A missing file fails with "missing spec file", a different one with "differs from the code". Run the test with `SPEC_WRITE=1`, outside CI, to write the file on purpose; the `write` option overrides that.

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

## Requirements

- [`spec.verifies-tags-tests`](requirements/verifies-tags-tests.md)
- [`spec.verifies-counts-assertions`](requirements/verifies-counts-assertions.md)
- [`spec.verifies-rejects-bad-ids`](requirements/verifies-rejects-bad-ids.md)
- [`spec.type-test-marks-type-only`](requirements/type-test-marks-type-only.md)
- [`spec.expect-spec-file`](requirements/expect-spec-file.md)
