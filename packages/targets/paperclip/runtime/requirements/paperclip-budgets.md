# runtime.paperclip-budgets

- Status: active
- Since: unreleased
- Source: HAL-17977, step 5 of the phase 3 plan on HAL-17450 (rev 5, "budgets and seat rules", first read-only; writing budgets needs the board's yes); HAL-18964 (project budgets, plan HAL-17960 PR 1), with `projects.read` approved on HAL-18967; Liam's note on #6011 (the 500-limit note)

When a tool runs `paperclip.budgets`, the runtime shall read the company's agents and projects from Paperclip and answer an `Agents:` section and then a `Projects:` section. Each has one line per agent or project Paperclip lists, sorted by url key, with the monthly budget the tool's `agents` or `projects` setting gives it and the one Paperclip has, both in dollars, and then one line per url key the setting names that Paperclip doesn't list. It shall compare in whole cents and flag every line where the two differ, where the workspace sets no budget, where Paperclip has no such agent or project, where Paperclip gives no budget, or where a project's Paperclip budget isn't monthly (which it then doesn't compare). Its first line shall say how many agents and projects it lists, how many differ, and that it only reads. When Paperclip's agent or project list returns 500 items, its limit, the line right under that section's heading shall say that the ones after those are missing. It shall change nothing in Paperclip and ask for no capability beyond `agents.read` and `projects.read`, the latter used only to list projects.

## Examples

- Given the workspace sets Mateo $50, Ravi $30 and Tomas $10, and Paperclip has Mateo at 4000 cents, Ravi at 3000 and Nina at 2000,
  when an agent calls the tool,
  then it answers "4 agents and 0 projects, 3 differ", Mateo's line ends "(differs)", Nina's "(not set in the workspace)", Tomas's "(no such agent in Paperclip)", Ravi's has no flag, and nothing is written.
- Given the workspace sets Mateo $12.50 and Paperclip has 1250 cents,
  when they are compared,
  then they match.
- Given Paperclip's agent list fails,
  when an agent calls the tool,
  then it answers with an error that says it couldn't read the budgets.
- Given the workspace sets the website project $80 and a project `phase` $20, and Paperclip has the website at 6000 cents a calendar month and Docs with no budget,
  when an agent calls the tool,
  then the website's line ends "(differs)", Docs's "(not set in the workspace)" and phase's "(no such project in Paperclip)".
- Given a project whose Paperclip budget runs over its lifetime,
  when it is compared,
  then it is flagged as not monthly rather than compared.
- Given Paperclip's project list returns 500 projects,
  when an agent calls the tool,
  then the line under `Projects:` says the list stopped at 500 projects.
- Given an action that doesn't declare `projects.read`,
  when its code lists projects,
  then the call is refused before it reaches Paperclip.
