# settings.ai-agent-view-only

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.device-wide`; flow-settings 7 and 13 (HAL-646)

The Settings feature shall show the Assistant section, when Studio is served to another device, as values and not as fields: the first line for the computer running Halonic, then "View only here. Change the assistant on the computer running Halonic.", then each value (Provider, and with a provider Model, Base URL, Secret name and Local; then Turn limit, Connector tools and Instructions) with its label over it. Nothing there shall change a setting.

## Examples

- Given the Assistant uses Ollama and Studio is served,
  when the section opens,
  then the view-only line shows, Provider reads "Ollama (local)", and the section has no input, select or switch.
