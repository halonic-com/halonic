# Decision: a wait with a timer and an arrow without event gets the step's warning

- Approval: Liam asked for this in the review of #4780 on HAL-15590, carried to HAL-15648; Liam approves this note in review
- Kind: user-visible
- Task: HAL-15648

## What changes

`wait-without-events` leaves timers out when it asks whether a wait only
listens to `done`. A wait with a plain timer and a transition without an event
offered a person only "done" but got no warning: the timer made the old check
see a non-`done` transition, and `wait-arrow-without-event` needs a named
answer. Now it gets `wait-without-events`, once for the step, as a wait without
the timer does. A wait with only timers is a pause and still gets no warning.

The requirement `workflow.validate-wait-arrow-event` says where the two
warnings meet, so its last sentence and two new examples say this.

## Covers

- workflow.validate-wait-arrow-event
