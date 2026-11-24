# Decision: a run token limit in the workspace budget

- Task: HAL-17286
- Approval: Liam approves the plan on HAL-17286 (https://paperclip.halonic.com/HAL/issues/HAL-17286#comment-8ba566d4-50a8-475a-b7a4-457c4963e267) and the Studio fix (https://paperclip.halonic.com/HAL/issues/HAL-17286#comment-c5f9248f-932d-4328-85e0-6eda29df7edf). A team decision with no board card (HAL-2282 rule).
- Kind: behaviour

## What changes

`workspace.yaml` gains an optional `budget.perRunTokens`: a positive whole number of tokens a run
may use, all tokens counted (cache reads and writes included), the top-level run and its child
runs together. The workspace JSON schema (a golden file) gets the new key and its description.

Studio's Budget block still shows only the money amounts. Removing the last amount keeps
`budget` when it holds a currency or a `perRunTokens`, so the token limit is never deleted by
**Remove budget**. The requirement `models.budget.budget-settings` now says so. No wording a user
reads changes.

## Why

Agreed on HAL-17251: one harness step was already bounded, a whole run was not.

## Covers

- packages/core/format/spec/workspace.schema.json
- models.budget.budget-settings
