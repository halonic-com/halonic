# app.instruction-trust-service

- Status: active
- Since: 0.1.0
- Source: HAL-3106 slice 3c; Liam's decision on HAL-10213

The app package shall have `InstructionTrustService`, which checks a run's instruction pin against the pin saved in the `InstructionTrustStore` for the agent, and saves a pin as trusted only when its `trust` is called, which only a person's action does. It shall answer `ask`, never `trusted`, when the store has no record, when the store can't read the record, and when the record it gives back isn't valid for the agent asked about; in the last two cases the answer shall say why. `revoke` shall delete the agent's record, so the next check asks.

## Examples

- Given an agent nobody has trusted,
  when its pin is checked,
  then the answer is to ask, naming each file as added.
- Given a pin a person trusted,
  when the same pin is checked, the answer is `trusted`; when `AGENTS.md` has another digest, the answer is to ask, naming it as changed.
- Given a store that can't read the record,
  when the pin is checked,
  then the answer is to ask, with the store's reason.
- Given a store that gives back another agent's record,
  when the pin is checked,
  then the answer is to ask, saying the record isn't valid.
