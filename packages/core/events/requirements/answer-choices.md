# events.answer-choices

- Status: active
- Since: unreleased
- Source: HAL-12411 (R7 of Sofia's UX check on HAL-12390: the banner names the step's choices; Liam's yes on HAL-12464 to the choices in the shared facts)

The events package shall give the typed cause of an `answer-not-an-option` failure: the kind `invalid_input`, the code `agent.answer-not-an-option`, and a `detail` with the agent's id in `agent` and the choices the engine checked the answer against in `options`, as one JSON array of strings in the step's order. The cause shall never hold the answer. It shall read the agent and the choices back from a cause, and give nothing for any other cause, and for one whose agent is empty or whose `options` isn't a JSON array of one or more strings, so a screen keeps its plain line. An `agent.finished` event with an `error` may carry the same `cause`, so a parallel branch's failure keeps its choices when the run is rebuilt from the log.

## Examples

- Given the agent `sorter` and the choices `refund`, `question` and `spam`,
  when the cause is built,
  then it is `{ kind: "invalid_input", code: "agent.answer-not-an-option", detail: { agent: "sorter", options: '["refund","question","spam"]' } }`.
- Given that cause,
  when it is read back,
  then it gives the agent `sorter` and the three choices in that order.
- Given a choice with a comma or a quote in it, such as `yes, "now"`,
  when the cause is built and read back,
  then the choice comes back as it was.
- Given a cause with another code, no cause, an empty agent, or `options` that isn't a JSON array of strings,
  when it is read,
  then it gives nothing.
