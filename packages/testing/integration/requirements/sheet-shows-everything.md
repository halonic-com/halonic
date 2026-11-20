# integration.sheet-shows-everything

- Status: active
- Since: unreleased
- Source: HAL-14087 (Liam's decision on HAL-14082: the integrations' own `sheet.test.ts` moves into the shared suite)

When the declaration is checked, the conformance suite shall fail when the sheet lists the tools in another order than the code offers them, and when any tool takes an argument without a description, naming the tool and the argument, since the sheet can't show such an argument and the user would approve the tool without seeing it.

## Examples

- Given a sheet that lists `save-favourite` before `forecast` while the code offers `forecast` first,
  when the declaration is checked,
  then it fails with "the sheet lists the tools as save-favourite, forecast".
- Given code whose `forecast` takes `city` with no description, and a sheet that lists no arguments,
  when the declaration is checked,
  then it fails with `"forecast" takes "city" without a description`.
