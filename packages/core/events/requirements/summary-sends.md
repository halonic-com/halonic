# events.summary-sends

- Status: active
- Since: 0.1.0
- Source: [HAL-2868](/HAL/issues/HAL-2868), from Sofia's wording call on [HAL-2848](/HAL/issues/HAL-2848) ("Sent 1 email, 2 invites", in call order); reader rules from [HAL-2831](/HAL/issues/HAL-2831); child runs from Sofia's Q1 on HAL-2868

The events package shall work out from a run's log what the run sent, by the reader rules of `events.tool-result-risk`, so the receipt of `halonic run` and the runs list say the same thing. It gives the calls that sent and the calls that may have sent, each as one group per verb, ordered by the verb's first call. Inside a group there is one count per noun, ordered by the noun's first call. Calls with the same verb and noun add up. A call without a `verb` counts as `sent`. It also says whether the run made a tool call at all, because a run "sent nothing" only when it made none. Starting a child run counts as a tool call, because the child may have sent; what the child sent stays in its own log.

## Examples

- Given ok send calls for an email, an invite, a file saved, another invite and another email, in that order,
  when what the run sent is worked out,
  then it is "sent" with 2 emails and 2 invites, then "saved" with 1 file.
- Given two ok send calls of different tools with the noun `email`,
  when what the run sent is worked out,
  then it is "sent" with 2 emails.
- Given a send call with `outcome: "unknown"`,
  when what the run sent is worked out,
  then it is not in what was sent, and it is in what may have been sent, grouped the same way.
- Given a send call that failed, a send call without a `noun`, a send call without `outcome`, and a write call,
  when what the run sent is worked out,
  then nothing is sent or may have been sent, and the run made tool calls.
- Given a run log without tool calls,
  when what the run sent is worked out,
  then nothing is sent or may have been sent, and the run made no tool call.
- Given a `tool.called` event without a `tool.result`,
  when what the run sent is worked out,
  then the run made a tool call.
- Given a run log whose only call starts a child run,
  when what the run sent is worked out,
  then nothing is sent or may have been sent, and the run made a tool call.
