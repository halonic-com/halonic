# app.run-proposal-reject

- Status: active
- Since: 0.1.0
- Source: engine answer 2 on HAL-3267; req-inbox `inbox.proposal.accept-and-reject`; HAL-4121; HAL-3248

When the person rejects a file of a run's proposal, or all of it, the proposal service shall mark each undecided file it covers rejected, leave the saved files alone, and give back the decisions record, before and after, as one undo step.

## Examples

- Given run `01JD8Q` changed the model of `clerk`,
  when the person rejects that file,
  then `agents/clerk.agent.yaml` is unchanged, the decision says rejected, and undoing the step makes it undecided again.
- Given the person accepted `agents/clerk.agent.yaml` of run `01JD8Q`,
  when they reject all,
  then only the other files become rejected.
