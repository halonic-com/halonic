# workspace.has-budget

- Status: active
- Since: unreleased
- Source: flow-models 2.1 "Has a budget" rule (HAL-177), HAL-63

The workspace package shall say whether a workspace has a budget: it does when `budget` in `workspace.yaml` has `perRun` or `monthly`, and never just because a `budget` block exists. A block with only a currency means no limit.

## Examples

- Given `budget: { currency: EUR, monthly: 50 }` or `{ currency: EUR, perRun: 5 }`, when asked, then the workspace has a budget.
- Given `budget: { currency: USD }` with no amounts, or no `budget` at all, when asked, then it has none.
