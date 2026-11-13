# kit.month-bars

- Status: active
- Since: 0.1.0
- Source: HAL-8422, HAL-8442; board decision of 13 Nov (HAL-8416)

The kit's `MonthBars` shall draw the last six months' values as bars on a card, oldest first: the current month (the last) in blue (`series-1`), earlier months in slate (`series-other`), and any month whose value is above its budget in amber (`attention-fill`). It shall show the current month's value as one big number in normal digits and write the month names under the bars with equal-width digits. When every month is zero it shall show the given empty text instead of bars. It shall name the chart by its title and give screen readers every month's value as text, saying which months are over budget.

## Examples

- Given eight months, when it renders, then only the last six get bars.
- Given a current month and an earlier month, when it renders, then the current bar is `series-1` and the earlier one `series-other`.
- Given a month with a value of 120 and a budget of 100, when it renders, then its bar is `attention-fill` and its text says "over budget".
- Given six months of zero, when it renders, then it shows the empty text and no bars.
- Given a month with a negative value (a refund), when it renders, then its bar has no height, not a negative one.
