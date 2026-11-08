# check.coverage-measured-in

- Status: active
- Since: 0.1.0
- Source: HAL-650

When a testing package's coverage floor says `"measuredIn": "<package>"`, the shared Vitest preset shall measure that package's `src` in the named package's test run, hold each folder to its own floor, and fail that run when either folder is below its floor.

## Examples

- Given a testing package with `"coverage": { "lines": 80, "measuredIn": "@acme/adapter" }`
  and an adapter that lists it in `devDependencies`,
  when the adapter's tests reach less than 80% of the testing package's lines,
  then the adapter's test run fails.
- Given the same packages,
  when the testing package's lines are fully reached but the adapter's own `src` is below its floor,
  then the adapter's test run fails on its own `src` alone.
- Given `"measuredIn"` in a package outside the testing layer, with a floor below 80, or naming a package
  that doesn't depend on it or doesn't run the shared preset,
  when `pnpm check` runs,
  then it fails.
