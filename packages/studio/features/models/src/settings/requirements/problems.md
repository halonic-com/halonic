# models.settings.problems

- Status: draft
- Since: 0.1.0
- Source: flow-settings 3.1 and 4 (HAL-646); HAL-10386

The Models section of Settings shall show a chip for each thing that needs a look, in a wrapping row under its line: **Budget used up** first, then **No key for Anthropic** (named for the provider) for each provider whose key is known to be missing. A chip shall show only when it applies. **Budget used up** applies when a provider may bill per use, a monthly budget is set and this month's estimated cost has reached it. **No key for …** applies to a cloud provider that names a secret when no key is stored under it. A check that fails or hasn't answered shall show no chip. The section shall also tell the Settings list whether any chip applies, so the list can mark its row.

## Examples

- Given a monthly budget of 50 and 50.00 spent this month, then "Budget used up" shows.
- Given a provider "Anthropic" with the secret `k-a` and no stored key, then "No key for Anthropic" shows, after "Budget used up" when that shows too.
- Given every key stored and the budget not reached, then no chip shows and the list has no mark.
- Given the check for a stored key fails, then no chip shows for it.
