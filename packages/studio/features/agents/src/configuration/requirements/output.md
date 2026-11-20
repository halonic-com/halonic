# agents.configuration.output

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6); flow-agents 5.1 and 5.2; microcopy 8.5; save model 1.2; UX checklist T6 part 2, 2.4 and 2.9 (T6-F22, T6-F23)

The agents feature shall show, on the Behaviour page after Instructions, the agent's Output as Tabs "Text", "One of a list" and "JSON", and save each by itself with no Save button: picking Text saves `output: { type: text }`; One of a list shows the options as a chip list, each chip with its ✕ named "Remove *option*" and the Add chip last, and saves `output: { type: choice, options: [...] }` when an option is added or removed; JSON shows "Schema (JSON)" with the hint "The agent is asked to reply in this shape." and saves `output: { type: json, schema }` after a pause in typing and when the person leaves the field, with no schema while the box is empty. A list with no options shall not be saved and shall say "Add at least one option."; a schema that isn't JSON shall not be saved and shall say "This isn't valid JSON.", and JSON that isn't an object "A schema is a JSON object, between { and }.". In each case the file keeps what it had, and Output shall count as a field not saved for the toolbar's "1 field not saved", as shall a schema whose save failed, until it is fixed or saved, another tab is picked, or the page is left.

## Examples

- Given an agent whose file has no `output`, then Text is the picked tab.
- Given the person picks One of a list, adds reply and archive, then the file's output is a choice of reply and archive.
- Given the options reply and archive, when the person removes reply, then archive is saved alone and focus goes to archive's ✕; when they remove archive too, then nothing is saved, the field says "Add at least one option." and focus goes to the Add chip.
- Given the person types an option and presses Esc, then the option isn't added.
- Given the person picks JSON and types `{ "type": "object" }` and pauses, then the file's output is JSON with that schema.
- Given the person types `{ "type": ` in Schema (JSON), then nothing is saved and the field says "This isn't valid JSON."; for `[1, 2]` it says "A schema is a JSON object, between { and }.".
- Given the person picks Text, then the file's output is text.
- Given the person removes the last option, then the toolbar says "1 field not saved"; adding one, or picking Text, brings it back.
