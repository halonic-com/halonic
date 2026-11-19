# agents.configuration.behaviour

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 4b); flow-agents 5.1 and 5.2; microcopy 8.5; save model 1.2 and 8.4

The agents feature shall give the agent page a Configuration view with a list of pages on the left (across the top in the phone layout, `agents.configuration.pages-phone`) and, as far as they are built, only those pages in it; its Behaviour page shall show Description and Instructions and save each by itself, after a pause in typing and when the person leaves the field, with no Save button; a text that looks like a key shall not be saved and shall say "This looks like a key. Keep it as a secret instead?".

## Examples

- Given Configuration is open, then the list holds Behaviour only, and Description and Instructions show what the file holds.
- Given Instructions is empty, then it shows the hint "What it should do and how, in plain words. It follows this every time it runs."
- Given the person types in Instructions and pauses, then the new text is saved as one change.
- Given the person pastes a key into Instructions, then nothing is saved and the field shows "This looks like a key. Keep it as a secret instead?".
