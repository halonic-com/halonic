# integration.sample-plugin

- Status: active
- Since: 0.1.0
- Source: HAL-1741 (P8, "a sample plugin in the repo, example data only, with a backend and a `ui` block, used by the suite and by the author guide")

The package shall carry a sample plugin, `examples/acme-orders-plugin`, with invented data only, a backend and a `ui` block with a setting, a command, a card and a panel, and its backend loaded from its `entry` shall pass the whole plugin conformance suite on its recordings.

## Examples

- Given the sample plugin, its backend imported from `backend/index.js` and its two recordings, when the suite runs, then every check passes, and each tool's result is the one its recording gives.
