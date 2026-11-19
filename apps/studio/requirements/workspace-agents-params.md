# studio.workspace-agents-params

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6, Model › More settings); flow-agents 5.2; the agent file's `params`

The desktop app's agents host shall give an agent's settings the model settings its file sets under `params` (temperature, top-p, max tokens, stop and reasoning effort), without the provider extras, and shall set or clear each one by editing the file in place as one undoable change, keeping the settings the change doesn't name and the provider extras. It shall refuse a temperature outside 0 to 2, a top-p outside 0 to 1, max tokens that aren't a whole number above 0, and an empty stop sequence, and write nothing. Clearing a setting the file doesn't have shall write nothing.

## Examples

- Given an agent file with `params: { temperature: 0.2, extra: { seed: 7 } }`, then the settings give the temperature 0.2 and no extras.
- Given that agent, when top-p 0.9, max tokens 800, the stop sequence END and reasoning effort high are set, then the settings give all five.
- Given that agent, when the temperature and the stop sequences are cleared, then the settings give the other three, and the file still has `seed: 7` and its other lines.
- Given the temperature 2.5, the top-p -0.1, max tokens 0 or 1.5, or an empty stop sequence, then the change fails with `invalid_input` and nothing is written.
- Given an agent with no temperature, when the temperature is cleared, then nothing is written.
