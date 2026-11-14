# models.aliases.edit-price

- Status: draft
- Since: 0.1.0
- Source: HAL-207 M1, agreed in flow-models 2.3 and 8 (HAL-177); HAL-63 (budgets)

When the user enters an input and output price per million tokens on an alias's tab, the models feature shall write them to that alias's `price` in `models.yaml`, saved at once and undoable as one step (Ctrl Z), read in the workspace's budget currency, and when both fields are empty write no `price`.

## Examples

- Given alias `smart` has no price,
  when the user types `3.00` as input and `15,00` as output,
  then `models.yaml` is saved with `price: { input: 3, output: 15 }` for `smart`.
- Given the user empties both price fields of `smart`, then `smart` has no `price` block.
- Given the user types `1.000,50`, then nothing is written and the field says "Enter an amount, like you'd write it on a receipt."
- Given alias `default` on a provider that runs on this computer, when the user enters a price, then its row in the list shows the price instead of "on this computer, no cost".
- Given alias `smart` on a cloud provider, when the user enters `0` as a price, then the page warns "A price of 0 means these calls look free in your estimated spend."
