# runs.run-view.instructions-refusal

- Status: active
- Since: unreleased
- Source: HAL-10524 (G1); instruction trust UX checklist (HAL-10517) S1, S2, S5, S7 and section 6; `events.run-failed-instructions-not-trusted`; `studio.workspace-instruction-trust`

When a run failed with the reason `instructions-not-trusted`, the run page shall show, in place of its usual failed banner, a banner named "Instructions not trusted" that says the agent didn't start, and why:

- "Reporter didn't start. You haven't trusted its instructions yet." when nothing was trusted before, or when the log doesn't say;
- "Reporter didn't start. Its instructions changed since you trusted them." when `changed` is true.

The agent and the pin come from `run.failed`; for a parallel branch the check refused, from that branch's `agent.finished`. A log that carries no pin shows the usual banner.

Where the open workspace provides `InstructionTrustHostService` (the desktop shell only), the banner shall have one action, **Review instructions**, which asks the host to trust that agent's instructions with that pin. The page never trusts by itself. After the answer the banner shall change to a calm tone and add one line, and never show the shell's own text:

- `trusted`: "Trusted. Run again to start it." and no button;
- `declined`: "Nothing was trusted, so the run didn't start.";
- `busy`: "A question about instructions is already open. Answer it first.";
- `unavailable`: "Nothing was trusted. Try again."

Where nothing provides the service (a served page or a phone), the banner shall say "Trust these instructions on your computer first." and have no button. A card in the Inbox shows the usual banner.

## Examples

- Given a run that failed with `instructions-not-trusted` for agent reporter, with `changed` true, on the desktop,
  when the person presses Review instructions and declines,
  then the banner reads "Reporter didn't start. Its instructions changed since you trusted them." and "Nothing was trusted, so the run didn't start.", and the button stays.
- Given the same run on a served page,
  then there is no button and the banner says "Trust these instructions on your computer first."
