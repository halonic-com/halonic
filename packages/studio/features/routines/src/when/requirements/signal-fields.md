# routines.when.signal-fields

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 8); flow-routines 3.3 and 3.5

While a routine starts on a signal, the When card shall show the signal's name, which is written as it is typed and can't be emptied (the last name stays in the file, with "Give the signal a name." shown), and under Advanced "Only when", the condition as JSON: empty writes no condition, a JSON object is written once it parses, and text that isn't a JSON object shows "Not valid JSON." once the field is left and writes nothing; Advanced starts open when the routine has a condition. Picking On a signal writes the name `mail.tagged`.

## Examples

- Given the name changes to `deploy.done`, then the signal is written with that name and its condition kept.
- Given "Only when" holds `{"exists":"mail.id"}`, then the signal is written with that condition.
- Given "Only when" holds `{` and the field is left, then "Not valid JSON." shows and nothing more is written.
