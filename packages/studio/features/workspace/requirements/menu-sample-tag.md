# workspace.menu-sample-tag

- Status: active
- Since: unreleased
- Source: flow-first-run 8 ("Recent and workspace picker tag: Sample"); HAL-12721 (L10), HAL-12729

When a workspace in the workspace menu's Recent is remembered as the Acme sample, its row shall end in the outline tag "Sample", as its row on Welcome's Recent does. A row of any other workspace shall have no tag.

## Examples

- Given "Acme sample" is remembered as the sample and "Beta" is not,
  when the workspace menu opens,
  then the "Acme sample" row has the tag "Sample" and the "Beta" row has none.
