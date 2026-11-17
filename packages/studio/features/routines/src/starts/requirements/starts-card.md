# routines.starts.starts-card

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 10); flow-routines 3.6 and 3.11; microcopy 12.3

The routine page shall show a Starts card with a picker of the workflows and agents the routine's hub lets it start, and for a workflow its Input as JSON or for an agent its Prompt, with the placeholders the text may use (`{{trigger.at}}` and `{{trigger.lastRun}}`, plus `{{trigger.message}}` for mail and `{{trigger.signal}}` for a signal); picking another target shall write it with input `{}` or the prompt "Describe what to do.", an input that is JSON shall be written as it is typed while text that isn't shows "Not valid JSON." once the field is left and writes nothing, a prompt shall be written as it is typed and shall not be emptied, and a target that can't be started shall show its one line: the id with "not found", "*Name* isn't live yet, so this routine can't start it." or "*Name* is in the trash, so this routine won't start it."

## Examples

- Given a routine that starts the workflow `briefing` and the hub's agent `helper`, then picking `helper` writes that agent with the prompt "Describe what to do."
- Given the input field changes to `{"a":1}`, then that input is written.
- Given the input field changes to `{"a":`, then nothing is written and "Not valid JSON." shows once the field is left.
- Given the prompt is emptied, then nothing is written and "Give the agent something to do." shows.
- Given a routine whose target is `ghost` and not found, then the card shows `ghost` with "not found".
