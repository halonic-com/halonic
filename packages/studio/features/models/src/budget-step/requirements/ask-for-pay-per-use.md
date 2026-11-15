# models.budget-step.ask-for-pay-per-use

- Status: draft
- Since: 0.1.0
- Source: flow-models 4.1 to 4.3 (HAL-177), HAL-63 (B3, B6), HAL-207 M2

The models feature shall offer the Prices and budget step when a provider that may bill per use gets its first key or turns pay-per-use (or moves to another host), while the workspace has no budget; when the workspace has a budget it shall offer only the prices, and only while an alias on the provider has none. Saving the step writes each filled price row to its alias in `models.yaml` and the budget amounts to `workspace.yaml`, as one undoable step; a currency other than the workspace's is written as `budget.currency`, which alone is still no budget. A field that isn't an amount writes nothing, and every such field is named in its own message at once, with focus on the first. A row with only one price filled is named in its empty field, unless the filled price isn't an amount either, which is named instead. The dialog's button reads **Save prices** while both budget fields are empty and **Save budget** otherwise; with every field empty it writes nothing and closes, like **Decide later**. In the narrowed step **Change** moves focus to Per run and starts the fields at the budget the workspace has, so saving without a touch keeps it; emptying both fields removes it.

## Examples

- Given Anthropic with a secret and no budget, then the full step is offered; given a budget is set and `fast` has no price, then only the prices are offered; given every alias is priced, then nothing is.
- Given an Ollama provider on localhost with no key, then the step is never offered.
- Given a provider turns pay-per-use with a secret name, or its base URL moves from one public host to another, then it counts as newly pay-per-use; an edit that leaves it on the same host doesn't.
- Given the user types `3.00` and `15,00` for `smart` and `50` per month, then `models.yaml` has `price: { input: 3, output: 15 }` for `smart` and `workspace.yaml` has `monthly: 50`.
- Given the user picks USD in a euro workspace and enters only prices, then `workspace.yaml` gets `budget: { currency: USD }` and the workspace still has no budget.
- Given `1.000,50` for a price or `0` for a budget field, then nothing is written and that field says why.
- Given `abc` in the first Input and `0` in Per run, then both say why at once and focus is on the first Input.
- Given nothing is typed, then the button reads Save prices and pressing it closes the step without writing.
- Given the budget has `monthly: 50` and the user presses Change, then Per month shows `50` and Save keeps the budget.
