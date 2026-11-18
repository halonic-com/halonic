# agents.configuration.model

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 5a); flow-agents 5.1 and 5.2; microcopy 8.5

The agents feature shall give the agent's Configuration a Model page that lists the model aliases of the agent's hub in a picker and saves the choice when it is made, and that shows the turn limit, saves it after a pause in typing and when the person leaves the field, saves 6 when it is empty, and, for anything that is not a whole number from 1 to 200, saves nothing and says "Enter a whole number from 1 to 200.".

## Examples

- Given the hub has the aliases fast and smart, then the picker lists both and shows the one the agent uses.
- Given the person picks smart, then the agent's model is saved as smart at once.
- Given the person types 25 in Turn limit and pauses, then 25 is saved.
- Given the person empties Turn limit and leaves it, then 6 is saved.
- Given the person types 500, then nothing is saved and the field says "Enter a whole number from 1 to 200.".
