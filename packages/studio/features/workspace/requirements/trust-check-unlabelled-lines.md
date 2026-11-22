# workspace.trust-check-unlabelled-lines

- Status: active
- Since: unreleased
- Source: Iris's visual check C592 (HAL-15532, HAL-15541): a line without a label, such as the second address under **Reaches**, read ": example.com"

When the trust check shows a line under a row without a label, such as each address after the first under **Reaches** or the reason under **Runs**, it shall show neither a label nor a colon, and shall line the value up under the first value of the lines above it. Where a line asks for the attention tone, its value shall be amber.

## Examples

- Given an integration row with **Reaches** `a.example` and a second line `b.example` without a label,
  when the person opens the check,
  then the second line reads "b.example", in the value column under "a.example", with no colon before it.
