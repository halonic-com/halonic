# workflow.answer-labels

- Status: active
- Since: 0.1.0
- Source: Liam's architecture decision on HAL-4014 (for the Inbox answer labels, HAL-4008)

When a run waits in a state, the workflow rules shall give the label its author wrote for each event the state accepts: the first non-empty label of the event's transitions, in file order, with surrounding spaces trimmed. An event without a label, and a timer transition, shall have none.

## Examples

- Given a wait state with `approve` unlabelled and then labelled "Send reply" and "Send anyway", an unlabelled `reject`, a `hold` labelled with spaces only and a timer labelled "Too late", when its labels are listed, then there is one: `approve` is "Send reply".
- Given a final state, when its labels are listed, then there are none.
