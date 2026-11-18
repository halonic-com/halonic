# agents.configuration.model

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 5a); flow-agents 5.1 and 5.2; microcopy 8.5

The agents feature shall give the agent's Configuration a Model page that lists the model aliases of the agent's hub in a picker and saves the choice when it is made and, while the agent's file names no model, shows the default as "Workspace default (*name*)" instead of "Choose a model", and that shows the turn limit, saves it after a pause in typing and when the person leaves the field, saves 6 when it is empty, and, when the aliases can't be read, says "Couldn't load the models" with **Try again** instead of an empty picker, and, for anything that is not a whole number from 1 to 200, saves nothing and says "Enter a whole number from 1 to 200.".

While the agent's file names a model alias the hub doesn't have, the Model page shall keep the name in the picker and say under it "*name* isn't a model alias in this workspace. Choose one, or add it in Models."; a `provider/model` name needs no alias and gets no error.

## Examples

- Given the hub has the aliases fast and smart, then the picker lists both and shows the one the agent uses.
- Given the file names no model and the workspace default is smart, then the picker shows "Workspace default (smart)"; with no default it shows "Choose a model".
- Given the person picks smart, then the agent's model is saved as smart at once.
- Given the person types 25 in Turn limit and pauses, then 25 is saved.
- Given the person empties Turn limit and leaves it, then 6 is saved.
- Given the person types 500, then nothing is saved and the field says "Enter a whole number from 1 to 200.".
- Given reading the aliases fails, then the page says "Couldn't load the models", and Try again loads the picker once the read works.
- Given the file names the model smrt and the hub has no such alias, then the picker shows smrt and the field says "smrt isn't a model alias in this workspace. Choose one, or add it in Models." until the person picks an alias.
- Given the file names the model ollama/llama3.2, then the picker shows it and the field has no error: a `provider/model` name needs no alias.
