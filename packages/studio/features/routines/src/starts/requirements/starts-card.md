# routines.starts.starts-card

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 10); flow-routines 3.6 and 3.11; microcopy 12.3; HAL-12401; HAL-12403; HAL-14647

The routine page shall show a Starts card with a picker of the workflows and agents the routine's hub lets it start, and for a workflow its Input as JSON or for an agent its Prompt, with "Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts." under the picker while an agent is picked, where a workflow with a `start:` block shows the field it names under its label, written as it is typed into the input with what else the input holds kept, with "*Name* needs this. Left empty, it starts with nothing to work on." while it is empty and the Input as JSON under Advanced, open when the input holds more than that field, and only the JSON while that field holds something other than text, with the placeholders the text may use (`{{trigger.at}}` and `{{trigger.lastRun}}`, plus `{{trigger.message}}` for mail); picking another workflow shall write it with input `{}` while picking another agent shall show it with an empty Prompt whose hint is "Describe what to do." and the line "Say what *Name* should do." and write it only once a prompt is typed, an input that is a JSON object shall be written as it is typed while text that isn't shows "The input has to be a JSON object, such as {}." once the field is left and writes nothing, a prompt shall be written as it is typed and shall not be emptied, and a target that can't be started shall show its one line: the id with "not found", "*Name* isn't live yet, so this routine can't start it." or "*Name* was deleted, so this routine won't start it.", and, while the saved target differs from the live version's, "Your new choice isn't live yet. Until it is, the routine starts *Name*."

## Examples

- Given a routine that starts the workflow `briefing` and the hub's agent `helper`, then picking `helper` writes nothing and shows an empty Prompt with the hint "Describe what to do." and "Say what Helper should do."; typing "Sum up the inbox" then writes `helper` with that prompt.
- Given `helper` is picked but has no prompt yet, then picking `briefing` again writes nothing.
- Given the input field changes to `{"a":1}`, then that input is written.
- Given a routine that starts Support reply, whose `start:` is `mail` labelled "Answer a customer's email", and input `{}`, then the card shows "Answer a customer's email" with "Support reply needs this. Left empty, it starts with nothing to work on." and Advanced closed; typing `{{trigger.message}}` writes `{"mail":"{{trigger.message}}"}`.
- Given that routine's input is `{"mail":"Hi","tone":"short"}`, then the field shows `Hi` and Advanced starts open; typing `Hello` writes `{"mail":"Hello","tone":"short"}`.
- Given that routine's input is `{"mail":{"from":"x"}}`, then the card shows only the Input as JSON.
- Given the input field changes to `{"a":` or to `[]`, then nothing is written and "The input has to be a JSON object, such as {}." shows once the field is left.
- Given a routine that runs on a signal, then the card offers `{{trigger.at}}` and `{{trigger.lastRun}}` and not `{{trigger.signal}}`.
- Given the prompt of `helper` is emptied, then nothing is written and "Say what Helper should do." shows.
- Given a routine whose target is `ghost` and not found, then the card shows `ghost` with "not found".

- Given the saved target differs from the live version's, then "Your new choice isn't live yet. Until it is, the routine starts Briefing." shows.
- Given a routine that starts the agent `helper`, or `helper` is picked, then "Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts." shows under the picker; with a workflow picked it doesn't.
