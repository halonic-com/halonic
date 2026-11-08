# Decision: `workflow.get-path` reads own properties only

- Requirement: `workflow.get-path` (`packages/core/workflow/requirements/get-path.md`)
- Task: HAL-638, found while porting `getPath` in HAL-622
- Approval: the package owner reviews first, then the maintainer gives final approval

## What changes

A path part now has to be an own property of the value before it. Inherited names such as
`constructor`, `__proto__`, `toString` or an array's `map` give `undefined`, like any missing part.
List indexes and `length` keep working, because they are own properties. The requirement says
"own property" and gains one example for inherited names.

The HAL-622 port pinned the old behaviour with the test "reads inherited properties, as the old
code did". That test now expects the opposite and is renamed "does not read inherited properties".

## Why

The old behaviour gave wrong results, not useful ones:

- `{{input.constructor}}` inside a text was written as `undefined`, because `JSON.stringify` of a
  function is `undefined`.
- `renderText("{{constructor}}", {})` returned `undefined`, though its type promises a string.
- `{{__proto__}}` gave `Object.prototype`, written as `{}` inside a text.
- A guard such as `exists: "input.constructor"` would be true for every input.

No workflow can rely on these results on purpose. The paths come from the workflow file, and
nothing is written through them, so this is a correctness fix, not a security one.

No test was weakened: the flipped test checks more names than before, and new tests cover
`render`, `renderText` and an own key named `__proto__` from `JSON.parse`.
