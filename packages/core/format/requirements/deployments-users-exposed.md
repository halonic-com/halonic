# format.deployments-users-exposed

- Status: active
- Since: unreleased
- Source: HAL-20108, HAL-20126 (selling layer design on HAL-12483, section 16.4)

When `parseFile` reads a `deployments.yaml`, the format shall accept in a deployment's `users` block an optional `exposed` list. Each entry shall have a `workflow` (a workflow id), a `name` (1 to 80 characters), an optional `description` (1 to 500 characters), a `kind` (`chat` or `form`), an optional `inputs` map from an input's name to `{ label, help? }` (`label` 1 to 80 characters, `help` 1 to 500), and an optional `shows` block with `answers` (a list of state names), `results` (a list of context keys) and `approvals` (a map from `<connector>/<tool>` to a text of 1 to 500 characters). State, input and key names shall be 1 to 64 letters, digits, `_` or `-`, not starting with `-`. The format shall refuse any other key in these blocks. A missing `inputs`, `answers`, `results` or `approvals` shall read as empty, and an empty one shall expose or show nothing; there shall be no wildcards.

When `exposed` is there and `mode` is not `many`, the format shall fail with `users-exposed-needs-many` at `exposed`.
