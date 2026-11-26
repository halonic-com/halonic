# agents.chat.budget

- Status: draft
- Since: unreleased
- Source: HAL-18928; states (HAL-5896) section 4, H21; microcopy 8.3 and 6.5; `inbox.budget-notices`, whose sentence this line is; `workspace.open-budget` (HAL-10915)

While this month's estimated spend has reached the workspace's monthly budget, the Try it chat shall show under the box, in `warning`, the Inbox's monthly notice word for word, "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget.", with **Change budget**, which opens Workspace settings at its Budget block (`workspace.open-budget`), and left out where the page can't. Send shall wait with that line as its reason, so no message is sent, and a reply's own buttons and forms shall send nothing. The line shall go once the budget changes so the spend is under it. It shall come after a held message, the harness and the sandbox, and before the model's missing key, and shall not show where the agents host can't read the budget.

## Examples

- Given a monthly budget of €50.00 and €50.00 spent this month,
  when Sorter's chat shows,
  then the line reads "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget." with Change budget.
- Given that line,
  when the person types "Sort this mail" and presses Send,
  then nothing is sent and the text stays in the box.
- Given that line,
  when the person clicks Change budget,
  then Workspace settings opens at Budget.
