# agents.configuration.model

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 5a); HAL-12697; flow-agents 5.1 and 5.2; microcopy 8.5; save model 1.2

The agents feature shall give the agent's Configuration a Model page that lists the model aliases of the agent's hub in a picker and saves the choice when it is made and, while the agent's file names no model, shows the default as "Workspace default (*name*)", or "Workspace default" when the alias is called `default`, instead of "Choose a model", and that shows the model call limit ("The most model calls in one step. Empty means 6. Claude Code and Codex agents don't use it."), saves it after a pause in typing and when the person leaves the field, saves 6 when it is empty, and, when the aliases can't be read, says "Couldn't load the models" with **Try again** instead of an empty picker, and, for anything that is not a whole number from 1 to 200, saves nothing and says "Enter a whole number from 1 to 200." after the pause or when the person leaves the field, not on every key, and that counts a model call limit with a mistake, or whose save failed, as a field not saved for the toolbar's "1 field not saved", until it is fixed or saved or the page is left.

## Examples

- Given the hub has the aliases fast and smart, then the picker lists both and shows the one the agent uses.
- Given the file names no model and the workspace default is smart, then the picker shows "Workspace default (smart)"; with no default it shows "Choose a model".
- Given the file names no model and the workspace default is the alias called `default`, then the picker shows "Workspace default".
- Given the person picks smart, then the agent's model is saved as smart at once.
- Given the person types 25 in Model call limit and pauses, then 25 is saved.
- Given the person empties Model call limit and leaves it, then 6 is saved.
- Given the person types 500, then nothing is saved and the field says "Enter a whole number from 1 to 200.".
- Given reading the aliases fails, then the page says "Couldn't load the models", and Try again loads the picker once the read works.
- Given the person types "2.", then no error shows until the pause or until they leave the field.
- Given the person types 500 and leaves Model call limit, then the toolbar says "1 field not saved"; typing 50 brings it back.
- Given saving 25 fails, then the toolbar says "1 field not saved" until the page is left.
