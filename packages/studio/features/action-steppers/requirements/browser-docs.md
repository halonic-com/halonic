# action-steppers.browser-docs

- Status: active
- Since: unreleased
- Source: HAL-20323, found in the security review of halonic#6732 (HAL-17552); the catalog's `checkedOn: "from docs"` for guided steps nobody walked on the live page (`core/action-catalog`, `guided-checks.ts`)

When a library browser step's `checkedOn` is `from docs`, the stepper shall show "From the service's docs, not checked on the page" over its instructions. When a library browser step's `checkedOn` is neither a `YYYY-MM-DD` day nor `from docs`, the stepper shall show "Not checked on the page", and never a date it can't read. A library step with a day keeps "Checked on <date>" (`action-steppers.browser`).

## Examples

- Given a guided step with `checkedOn: "from docs"`,
  when its request shows,
  then the step says "From the service's docs, not checked on the page", and not "Checked on".
- Given a guided step with `checkedOn: "last spring"`, or the day `2026-02-31`,
  when its request shows,
  then the step says "Not checked on the page", and "NaN" shows nowhere.
