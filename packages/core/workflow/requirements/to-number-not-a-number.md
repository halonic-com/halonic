# workflow.to-number-not-a-number

- Status: active
- Since: 0.1.0
- Source: `toNumber` in the old workflow package (`packages/core/workflow/src/guards.ts`) at 784f78d

If a value is not a finite number and not a text that reads as a finite number, then the workflow rules shall give `null` when a number is read from it.

## Examples

- Given an empty text, `n/a` or `-`, when a number is read, then the result is `null`, because there is no digit.
- Given `5-` or `1-2`, when a number is read, then the result is `null`.
- Given `null`, `true` or an object, when a number is read, then the result is `null`.
- Given `Infinity` or `NaN` as numbers, when a number is read, then the result is `null`.
