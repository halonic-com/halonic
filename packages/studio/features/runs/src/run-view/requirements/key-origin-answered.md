# runs.run-view.key-origin-answered

- Status: active
- Since: unreleased
- Source: HAL-11873 (PR 3b, HAL-15128); UX checklist on HAL-11873, C-20 and "After Allow" / "After Don't allow"

The run log view shall show a `key-origin.answered` event as one line in words, in place of its event line, with its number and its time with seconds: `Allowed {address} for key "{key}".` after Allow, and `Not allowed: provider "{provider}" can't send key "{key}" to {address}.` after Don't allow. The line shall never name who answered, and shall write a hidden or direction-changing character as its escape.

## Examples

- Given a run whose log holds `key-origin.answered` with provider "Gateway", key "gateway-key", address `https://gateway.example.com` and `allowed` at 09:14:05,
  when the run log is shown,
  then that line reads `09:14:05 Allowed https://gateway.example.com for key "gateway-key"`.
- Given the same event with `not-allowed`, then the line reads `Not allowed: provider "Gateway" can't send key "gateway-key" to https://gateway.example.com.`
