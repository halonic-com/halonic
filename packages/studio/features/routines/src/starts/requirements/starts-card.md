# routines.starts.starts-card

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 10); flow-routines 3.6 and 3.11; microcopy 12.3; HAL-12401

The routine page shall show a Starts card with a picker of the workflows and agents the routine's hub lets it start, and for a workflow its Input as JSON or for an agent its Prompt, with the placeholders the text may use (`{{trigger.at}}` and `{{trigger.lastRun}}`, plus `{{trigger.message}}` for mail); picking another workflow shall write it with input `{}` while picking another agent shall show it with an empty Prompt whose hint is "Describe what to do." and the line "Say what *Name* should do." and write it only once a prompt is typed, an input that is a JSON object shall be written as it is typed while text that isn't shows "The input has to be a JSON object, such as {}." once the field is left and writes nothing, a prompt shall be written as it is typed and shall not be emptied, and a target that can't be started shall show its one line: the id with "not found", "*Name* isn't live yet, so this routine can't start it." or "*Name* was deleted, so this routine won't start it.", and, while the saved target differs from the live version's, "Your new choice isn't live yet. Until it is, the routine starts *Name*."

## Examples

- Given a routine that starts the workflow `briefing` and the hub's agent `helper`, then picking `helper` writes nothing and shows an empty Prompt with the hint "Describe what to do." and "Say what Helper should do."; typing "Sum up the inbox" then writes `helper` with that prompt.
- Given `helper` is picked but has no prompt yet, then picking `briefing` again writes nothing.
- Given the input field changes to `{"a":1}`, then that input is written.
- Given the input field changes to `{"a":` or to `[]`, then nothing is written and "The input has to be a JSON object, such as {}." shows once the field is left.
- Given a routine that runs on a signal, then the card offers `{{trigger.at}}` and `{{trigger.lastRun}}` and not `{{trigger.signal}}`.
- Given the prompt of `helper` is emptied, then nothing is written and "Say what Helper should do." shows.
- Given a routine whose target is `ghost` and not found, then the card shows `ghost` with "not found".

- Given the saved target differs from the live version's, then "Your new choice isn't live yet. Until it is, the routine starts Briefing." shows.
