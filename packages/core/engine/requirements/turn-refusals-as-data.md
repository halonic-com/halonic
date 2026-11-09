# engine.turn-refusals-as-data

- Status: active
- Since: 0.1.0
- Source: HAL-1061, the base for HAL-803's refusals (HAL-998)

When a model turn refuses something, it shall return the refusal as data with the source, the tool where there is one, what was refused and why. If a server's listing fails, then the engine shall leave that server's tools out, refuse its listing, and go on with the other tools; the model shall not see a listing refusal. If the model calls a tool nobody offered, or the check before a call refuses it, then the engine shall not run it, shall return a `call` refusal, and shall give the model the reason as that call's result.

## Examples

- Given a server whose listing throws "offline",
  when the turn runs,
  then the model isn't offered its tools and the turn returns a `listing` refusal for it that says "offline".
- Given a model that calls `delete_everything`, which nobody offered,
  when the turn runs,
  then nothing runs, the model gets a refusal as the call's result, and the turn returns a `call` refusal for it.
