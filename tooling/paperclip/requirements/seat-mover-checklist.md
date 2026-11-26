# paperclip.seat-mover-checklist

- Status: active
- Since: unreleased
- Source: HAL-19354; the board's pre-move checklist on HAL-16116 and its audit rules on HAL-19354 (26 Nov)

When the Agent tools plugin's seat mover plans a pass, it shall move an agent off its seat when the seat is at its 5-hour stop (80%, 70% for a reviewer), at the weekly hard stop (95%), or past the weekly stop (88%) for a fast burner, when a run on the seat failed with `provider_quota` since the seat's reading or in the last 30 minutes (and the 5-hour reset the reading reports hasn't come since), when the agent has runs parked for that seat, or naming no seat, that never started, when it sits on an excluded seat or the paid API, when it is a running heavy agent on a reviewer's seat, when it is a heavy agent past the limit on its seat, or when it is a running heavy agent on the quiet seat; and it shall send each one only to a seat that passes every checklist item: (a) the week below 95%, and for a fast burner below 88% unless its weekly reset is less than 24 hours away, any week on the reset-fill list; (b) no reviewer on it, and for a reviewer no other reviewer, running heavy agent or never-move agent on it, reviewers first and to an empty seat when one may take them, then the seat with the most 5-hour room, then the fast burners; (c) at most two running heavy agents on it; (d) not an excluded seat (Admin); (e) not the paid API; (f) below the moving agent's 5-hour stop with 10% of the window kept for that agent and for each agent the pass already sends there, not full by a `provider_quota` failure, and no runs parked waiting for it; (g) for a running heavy agent, not the quiet seat, which is any seat an agent on the never-move list (the seat starter and the timer agents) sits on.

An agent no seat may take stays where it is and is listed as stuck. Each move is checked against the placement the batch has left so far, and a finished batch that would add a break on a seat it sends agents to (a reviewer with another reviewer, a running heavy agent or a never-move agent, too many heavy agents, anyone on an excluded seat or the paid API, or a running heavy agent on the quiet seat) is not sent; a break the seat already had before the batch doesn't stop it. A paused agent never moves; agents on the never-move list never move; an agent the mover moved less than two hours ago moves again only when it is parked or its seat is full or unusable, not for who it sits with; a seat without a usable reading moves nobody for its use and takes nobody. The stops, lists and limits are settings with these defaults.

## Examples

- Given an agent on a seat at 80% of its 5-hour window and seats at 40% and 20%,
  when the seat mover plans,
  then the agent moves to the seat at 20%.
- Given a reviewer that must move, an occupied seat at 0% and empty seats at 30% and 10%,
  when the seat mover plans,
  then the reviewer moves to the empty seat at 10%.
- Given a reviewer that must move, no empty seat with room, a seat of two light agents at 20% and a seat of a heavy agent at 0%,
  when the seat mover plans,
  then the reviewer joins the light agents, and they stay.
- Given three agents leaving a full seat, a seat at 72% and a seat at 55%,
  when the seat mover plans,
  then two go to the seat at 55% and the third is stuck.
- Given a full seat and a seat with two running heavy agents,
  when a heavy and a light agent must move,
  then the light agent may join that seat and the heavy one may not.
- Given an agent that must move and only Admin, the paid API and a seat at 95% of its week left,
  when the seat mover plans,
  then it moves nobody and lists the agent as stuck.
- Given the timer agents' seat at 5% of its 5-hour window and another seat at 40%,
  when a heavy agent must move,
  then it moves to the seat at 40%, and a light agent may join the timer agents' seat.
- Given the reset-fill seat at 97% of its week,
  when an agent must move,
  then that seat may take it.
- Given a seat at 89% of its week with its reset four days away,
  when a light agent and a fast burner must move,
  then the light agent may go there and the fast burner may not.
- Given a third heavy agent the mover moved an hour ago,
  when the seat mover plans,
  then it stays; two hours after its move it leaves.
