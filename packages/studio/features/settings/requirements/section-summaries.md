# settings.section-summaries

- Status: active
- Since: 0.1.0
- Source: HAL-9385 (B16); design check B16 (HAL-9316); UX checklist 3.1 and 3.23

The Settings feature shall give each of its sections an icon, and Assistant and Agent sandbox a one-line summary for the phone's Settings list. Assistant's summary shall read "Not set up" while no provider is set, else the model (or the provider's name when no model is named) and the turn limit, joined by " · ", such as "smart · turn limit 16". Agent sandbox's summary shall read the state chip's words, such as "Ready", once the host's check answers, and shall be left out when the app has no sandbox host or the check fails.

## Examples

- Given no provider is set up,
  when the summary of Assistant is read,
  then it is "Not set up".
- Given Anthropic with the model "smart" and the turn limit 16,
  when the summary of Assistant is read,
  then it is "smart · turn limit 16".
- Given Anthropic with no model named and the turn limit 8,
  when the summary of Assistant is read,
  then it is "Anthropic · turn limit 8".
- Given the sandbox host's check says it is ready,
  when the summary of Agent sandbox is read,
  then it is "Ready".
- Given the app gives no sandbox host,
  when the summary of Agent sandbox is read,
  then it is left out.
