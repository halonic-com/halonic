import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it } from "vitest";
import { getPath, render } from "./template.ts";

// A fixed seed keeps the run the same every time (no flaky tests); a failure
// prints its own seed and path to replay it.
const SEED = 622;

/** A few property names, so generated paths often hit generated keys. */
const key = fc.constantFrom("a", "b", "0", "1", "user_name", "x-y");

/** Nested scopes made of those keys: objects, lists, strings, numbers and null. */
const scope = fc.object({ key, maxDepth: 3 });

/** A dotted path of one to four of those keys, as a placeholder may hold it. */
const path = fc.array(key, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("."));

/** Text that has no `{{` in it anywhere. */
const textWithoutPlaceholder = fc.string().filter((text) => !text.includes("{{"));

verifies("workflow.render-template", () => {
  it("leaves any text without {{ as it is", () => {
    fc.assert(
      fc.property(textWithoutPlaceholder, scope, (text, anyScope) => {
        expect(render(text, anyScope)).toBe(text);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it("gives the value at the path for a whole placeholder", () => {
    fc.assert(
      fc.property(path, scope, (anyPath, anyScope) => {
        expect(render(`{{${anyPath}}}`, anyScope)).toBe(getPath(anyScope, anyPath));
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});
