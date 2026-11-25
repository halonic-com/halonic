# runtime.paperclip-budgets

- Status: active
- Since: unreleased
- Source: HAL-17977, step 5 of the phase 3 plan on HAL-17450 (rev 5, "budgets and seat rules", first read-only; writing budgets needs the board's yes)

When a tool runs `paperclip.budgets`, the runtime shall read the company's agents from Paperclip and answer one line per agent Paperclip lists, sorted by url key, with the monthly budget the tool's `agents` setting gives it and the one Paperclip has, both in dollars, and then one line per agent the setting names that Paperclip doesn't list; it shall compare in whole cents and flag every line where the two differ, where the workspace sets no budget, where Paperclip has no such agent, or where Paperclip gives no budget, and say in its first line how many agents it lists, how many differ, and that it only reads; it shall change nothing in Paperclip, and the action shall ask for no capability beyond the runtime's own `agents.read`.

## Examples

- Given the workspace sets Mateo $50, Ravi $30 and Tomas $10, and Paperclip has Mateo at 4000 cents, Ravi at 3000 and Nina at 2000,
  when an agent calls the tool,
  then it answers "4 agents, 3 differ", Mateo's line ends "(differs)", Nina's "(not set in the workspace)", Tomas's "(no such agent in Paperclip)", Ravi's has no flag, and nothing is written.
- Given the workspace sets Mateo $12.50 and Paperclip has 1250 cents,
  when they are compared,
  then they match.
- Given Paperclip's agent list fails,
  when an agent calls the tool,
  then it answers with an error that says it couldn't read the agents' budgets.
