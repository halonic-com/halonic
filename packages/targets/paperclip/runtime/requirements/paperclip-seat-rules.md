# runtime.paperclip-seat-rules

- Status: active
- Since: unreleased
- Source: HAL-18964 (plan HAL-17960, PR 1; approved with conditions on HAL-18963); HAL-18962 (which seat rules may live in a workspace, and that the seats plugin's rules can't be read by another plugin today); Liam's note on #6011 (the 500-limit note)

When a tool runs `paperclip.seat-rules`, the runtime shall read the company's agents from Paperclip and answer one line per agent the tool's `agents` setting names, sorted by url key, with the agent's name in Paperclip, its seat rule (`shared`, `pinned` or `own-seat`) and whether its paid API is `never`, flagging an agent Paperclip doesn't list; its first line shall say how many agents it lists, that the seats plugin's own rules can't be read so nothing is compared, that which seat an agent gets stays with the board, and that it only reads. It shall change nothing in Paperclip and ask for no capability beyond the runtime's own `agents.read`. When Paperclip's agent list returns 500 agents, its limit, both this report and `paperclip.budgets` shall say in their second line that agents after those are missing.

## Examples

- Given the workspace sets Ravi shared, Mateo pinned with paid API never and Tomas own-seat, and Paperclip lists Ravi and Mateo,
  when an agent calls the tool,
  then it answers 3 agents, Mateo's line says "pinned (never moved), paid API never", Tomas's ends "(no such agent in Paperclip)", and nothing is written.
- Given a tool file whose seat rule is a seat name, an email or a connection id,
  when it is parsed,
  then it fails at `action.with.agents.<agent>.seat` with an error that says seat names, emails and connection ids stay in the seats plugin's board-only settings.
- Given Paperclip's agent list returns 500 agents,
  when an agent calls the seat rules or the budgets,
  then the answer's second line says the list stopped at 500 agents.
