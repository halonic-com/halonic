# workflow.number-guard

- Status: active
- Since: 0.1.0
- Source: the `gt`, `gte`, `lt` and `lte` guards of `evaluateGuard` in the old workflow package (`packages/core/workflow/src/guards.ts`) at 784f78d

When a `gt`, `gte`, `lt` or `lte` guard is checked, the workflow rules shall render both sides, read each as a number the way `toNumber` does, and compare them. If either side is not a number, then the guard shall fail, whichever way it compares.

## Examples

- Given the context `amount: "EUR 1.250,00"`, when `gte: ["{{context.amount}}", 1000]` is checked, then it passes.
- Given `1000` and `"1,000.00"`, when `lte` is checked, then it passes.
- Given the context `text: n/a`, when `gt: ["{{context.text}}", 0]` or `lt: ["{{context.text}}", 0]` is checked, then both fail.
- Given `5` and `5`, when they are compared, then `gte` and `lte` pass and `gt` and `lt` fail.
