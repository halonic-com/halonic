# paperclip-client.team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, section 1.5, with Julian's security read HAL-17540); task HAL-17606

The Paperclip provider shall serve `TeamStatus`'s spend and seats for one connection with `GET` requests only, each on its fixed request list and pinned to its path: spend from Paperclip's `costs/summary`, `costs/by-provider`, `costs/by-agent`, `costs/by-agent-model` and `budgets/overview`, and seats from the `halonic.seats` plugin's `seats/summary`, never another route of that plugin. Paid money shall count what Paperclip billed only, so subscription work is 0 in money and shows in tokens. A seat shall carry only its label, role, state, windows, agents, manual reset and the pool's proposal, never anything else of the answer. A part whose plugin answers 404 shall read as not served.

## Examples

- Given the provider's request list,
  when its team status rows are read,
  then the spend and seat rows are exactly the six routes above, all `GET`, and the seats page, a manual reset, the seats route of another plugin and a budget write match none.
- Given an agent whose work ran on a subscription only,
  when its spend is read,
  then its paid money is 0 cents and its tokens are its runs' tokens.
- Given a server without the seats plugin,
  when the seats are read,
  then there are none and `parts` says seats aren't served.
