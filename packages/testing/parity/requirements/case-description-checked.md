# parity.case-description-checked

- Status: active
- Since: 0.1.0
- Source: HAL-108 (plan 9.3 point 7)

If a case's `case.json` is malformed, then the parity package shall refuse to load it and name the case, so a typo never records silently.

The parity package shall load the base and every case under `fixtures/cases/<kind>/<name>` in a stable order: the base first, then by kind and name.

## Examples

- Given a case whose fault is "typo", when the cases load, then loading fails and names the case and the allowed faults.
- Given a case with the fault "wrong-type" but no "expect", when the cases load, then loading fails.
- Given an "expect" whose line is 0, when the cases load, then loading fails; a line of null (no line applies) is accepted.
- Given cases "routine/b", "agent/a" and the base, when the cases load, then the order is base, "agent/a", "routine/b".
