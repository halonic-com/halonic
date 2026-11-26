# paperclip.seat-mover-checklist

- Status: active
- Since: unreleased
- Source: HAL-19354; the board's pre-move checklist on HAL-16116 (26 Nov)

When the Agent tools plugin's seat mover plans a pass, it shall move an agent off its seat when the seat is at its 5-hour stop (80%, 70% for a reviewer) or its weekly stop (88%), when a run on the seat failed with `provider_quota` since the seat's reading, when the agent has runs parked for that seat that never started, when it sits on an excluded seat or the paid API, when it shares a reviewer's seat, or when it is a heavy agent past the limit on its seat; and it shall send each one only to a seat that passes every checklist item: (a) the week below 88%, unless the seat is on the reset-fill list or its weekly reset is less than 24 hours away and its week below 98%; (b) no reviewer on it, and for a reviewer no agent at all, reviewers first and to the seat with the most 5-hour room; (c) at most two running heavy agents on it; (d) not an excluded seat (Admin); (e) not the paid API; (f) below the moving agent's 5-hour stop and not full by a `provider_quota` failure.

An agent no seat may take stays where it is and is listed as stuck. Each move is checked against the placement the batch has left so far, and a finished batch that would leave a reviewer with company, too many heavy agents, or anyone on an excluded seat or the paid API on a seat it sends agents to is not sent. A paused agent moves only for where it sits; agents on the never-move list never move; a seat without a usable reading moves nobody for its use and takes nobody. The stops, lists and limits are settings with these defaults.

## Examples

- Given an agent on a seat at 80% of its 5-hour window and seats at 40% and 20%,
  when the seat mover plans,
  then the agent moves to the seat at 20%.
- Given a reviewer that must move, an occupied seat at 0% and empty seats at 30% and 10%,
  when the seat mover plans,
  then the reviewer moves to the empty seat at 10%.
- Given a full seat and a seat with two running heavy agents,
  when a heavy and a light agent must move,
  then the light agent may join that seat and the heavy one may not.
- Given an agent that must move and only Admin, the paid API and a seat at 90% of its week left,
  when the seat mover plans,
  then it moves nobody and lists the agent as stuck.
- Given the reset-fill seat at 97% of its week,
  when an agent must move,
  then that seat may take it.
