# engine.budget-stop-message

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, step 6 ("the stop messages"); task HAL-3788

When a budget stops a run, the engine shall end it with the error `Run budget reached: <spent> of <limit> <currency> spent.` for the run budget, or `Monthly budget reached: <spent> of <limit> <currency> spent this month.` for the monthly budget. Amounts shall have two decimals, or up to four when the last ones aren't zeros, so a spend under a cent never reads as `0.00`. A run whose child run a budget stopped shall wrap the child's error as any child failure is wrapped, `Workflow "<workflow>" failed: <error>`, once for each level.

## Examples

- Given a run budget of 5 EUR and 5.08 EUR spent,
  when the message is made,
  then it is `Run budget reached: 5.08 of 5.00 EUR spent.`
- Given a monthly budget of 50 EUR and 50.1 EUR spent,
  when the message is made,
  then it is `Monthly budget reached: 50.10 of 50.00 EUR spent this month.`
- Given a run budget of 0.01 EUR and 0.0123 EUR spent,
  when the message is made,
  then it is `Run budget reached: 0.0123 of 0.01 EUR spent.`
- Given an `onboard` run whose `check` state runs `reply`, and a `reply` run its monthly budget stopped,
  when the parent hears from it,
  then the parent's error is `Workflow "reply" failed: Monthly budget reached: …`.
