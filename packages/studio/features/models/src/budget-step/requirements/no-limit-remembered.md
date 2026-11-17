# models.budget-step.no-limit-remembered

- Status: draft
- Since: unreleased
- Source: flow-models 4.2 and 4.4 (HAL-177), HAL-63 (B5), HAL-577

The models feature shall not offer the Prices and budget step for a provider when "No limit" is remembered for this workspace and that provider's host. The host is the address the provider calls, such as `api.openai.com`, never the computer running Halonic, so a new host asks again.

## Examples

- Given "No limit" is remembered for a provider, then the step isn't offered for it again, with or without a budget.
- Given the provider's base URL moves to another public host, then the remembered answer no longer applies and the step is offered.
