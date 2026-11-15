# models.budget-settings

- Status: draft
- Since: 0.1.0
- Source: flow-models 2.1 (HAL-177), HAL-63 requirements (budgets you can see), U30 in req-models (HAL-110)

The Models section of the workspace page shall show a Budget block while a provider may bill per use or a budget is set. With a budget it says the amounts that are set ("€5.00 per run · €50.00 per month") and has **Change**. With none it says "No budget set for" and up to three provider names, then "+n more", with **Set budget**. **Change** and **Set budget** open the two amounts in place, named with their currency ("Per run, in euros"), with focus on Per run. Saving writes `budget.perRun` and `budget.monthly` of `workspace.yaml` as one undoable step with a toast ("Budget set: …") that offers **Undo**; an amount that isn't above 0 writes nothing and says so under its field. With both fields empty the button reads **Remove budget** and the toast says "Removed the budget". Save and Cancel put focus back on the button that opened the editor. Removing the last amount removes `budget` from `workspace.yaml`, unless it has a currency. A budget block with only a currency is no budget.

## Examples

- Given `workspace.yaml` has `budget: { currency: EUR, perRun: 5, monthly: 50 }`, when the user opens the workspace page, then the block says "€5.00 per run · €50.00 per month" with **Change**.
- Given an Anthropic provider with a secret and no budget, then the block says "No budget set for Anthropic" with **Set budget**; given only local providers and no budget, then there is no block.
- Given the user presses **Set budget**, types `5` for Per run and `50,00` for Per month and presses **Save**, then `workspace.yaml` has `perRun: 5` and `monthly: 50`, a toast says "Budget set: €5.00 per run · €50.00 per month", and **Undo** puts the old text back.
- Given a budget is set and the user empties both fields, then the button reads **Remove budget**, and pressing it removes both amounts and shows "Removed the budget".
- Given the user types `0` or `abc`, then nothing is written and the field says "Enter an amount above 0, like you'd write it on a receipt."
