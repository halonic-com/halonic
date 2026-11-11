# app.money-amount

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); microcopy revision 94, 15.2 "Cost under one cent" (HAL-751); cli-output 3.4

The app shall write an amount of money in the workspace's currency, EUR when none is named, with two decimals, or three below one cent. An amount above zero that would read as zero with three decimals shall read "under" the smallest amount, 0.001. A negative or non-finite amount shall be refused.

## Examples

- Given 5.08 and 50,
  when they are written,
  then they read "€5.08" and "€50.00".
- Given 0.004,
  when it is written,
  then it reads "€0.004".
- Given 0.0004,
  when it is written,
  then it reads "under €0.001", never "€0.00".
- Given 0,
  when it is written,
  then it reads "€0.00".
- Given 2 in USD,
  when it is written,
  then it reads "$2.00".
- Given -0.5,
  when it is written,
  then it is refused.
