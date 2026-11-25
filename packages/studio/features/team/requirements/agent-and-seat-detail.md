# team.agent-and-seat-detail

- Status: active
- Since: unreleased
- Source: HAL-17737, child (c) of HAL-17712 in Liam's approved plan; Sofia's flows 1.1 (Agents by spend today), 1.3 and 1.4 on HAL-17510; HAL-17515 renders S10, S11 and S14 (HAL-18327).

The Spend and seats screen shall list Agents by spend today, most paid first and then most tokens, the top 5 with **See all** when more agents spent today. The agent detail page shall show, from `TeamStatus`, the agent's spend today, this week and this month, its own budget when it has one, this week's tokens by model and the seat that lists it now; and, from `AgentMessaging` when a workspace has it, its name, status word and the task it works on. The seat detail page shall show the seat's windows with their reset and 90% times, its manual reset, the agents on it with their status and task, and the Seat Supervisor's proposal marked "not done". Both pages shall only show: they never act, and data `TeamStatus` doesn't carry is left out, never guessed. When messaging is missing or fails, agents shall still show, as "Unknown agent", and the failure is logged. Each detail page shall have a back link to Spend and seats above its title, and its title shall be the agent's or seat's name; the seat page shall show the seat's state and its windows and manual reset under Limits, and **See all** shall list every agent's spend today, this week and this month with its seat, most paid first in the range the user picks.

## Examples

- Given seven agents spent today,
  when Spend and seats opens,
  then Agents by spend lists the five that paid most, and **See all** lists all seven.
- Given Owen paid least today but most this week,
  when **See all** is sorted by this week,
  then Owen is listed first.
- Given two agents that paid nothing today on subscription seats,
  when they are listed,
  then the one that used more tokens comes first.
- Given Mateo on Seat B, with $8.40 today, $61.30 this week and $402.10 this month,
  when his page opens,
  then it shows those amounts and "On Seat B", under the title "Mateo".
- Given Seat B with Owen and Kim on it and a proposal from 12:55,
  when its page opens,
  then it lists Owen and Kim with their status and task, and the proposal with "not done".
- Given a workspace where messaging fails,
  when an agent's page opens,
  then it still shows the agent's spend, as "Unknown agent".
