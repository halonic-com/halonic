# settings.ai-agent-tuning

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); flow-settings 7 (HAL-646); the agent file's `ModelParams` ranges

The Settings feature shall show a closed "Tuning" row under How it connects once a provider is set, and not before: Temperature (0 to 2), Top-p (0 to 1), Max tokens (a whole number above 0), Stop (one sequence per line) and Reasoning effort (Provider default, Low, Medium or High), each saved by itself as a host setting, with the other Assistant settings. An empty field shall mean the provider's default and put the setting back to it. A value outside its range shall show "Enter a number from 0 to 2." (or "0 to 1"; "Enter a whole number above 0." for Max tokens) and save nothing. A saved value that doesn't fit its setting shall read as the provider's default. When the section is served to another device, it shall show the five values as text.

## Examples

- Given a provider is set,
  when the person types 0.3 in Temperature and leaves it,
  then 0.3 is saved.
- Given the person types 3 in Temperature,
  when they leave it,
  then "Enter a number from 0 to 2." shows and nothing is saved.
- Given Temperature is 0.3,
  when the person empties it and leaves it,
  then the setting is back to the provider's default.
- Given the saved Top-p is 5,
  when it is read,
  then it is the provider's default.
