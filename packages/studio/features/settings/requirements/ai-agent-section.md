# settings.ai-agent-section

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.device-wide`, `.steps-per-answer` (U28); flow-settings 7 and 3.3 (HAL-646); microcopy 13 and 14

The Settings feature shall draw the Assistant section from the Assistant's host settings: a first line saying it is used for new assistant chats in every workspace on this computer (or on the computer running Halonic, when served) and is never saved in a workspace; the group **Assistant model** with Provider and Model; and the group **Answers** with Turn limit, Connector tools and Instructions. With no provider, the Provider shall say "Not set up. Assistant chats use each workspace's model aliases." Every change shall be saved by itself: a pick or a switch when it is made, a typed field when it is left (Enter in a one-line field too), and nothing while its field shows an error. When a save fails, a pick or switch shall go back to what it was and a typed value shall stay in its field; the section shall say "Couldn't save the … on this computer." under the control and in the dialog, never in a toast. When the settings change elsewhere, the section shall show the new value.

## Examples

- Given nothing is saved,
  when the section opens,
  then the Provider reads Not set up with its line, the Turn limit box is empty with the placeholder 16, and Connector tools are on.
- Given the person picks Ollama (local),
  when the save works,
  then the provider is `ollama`, the Base URL `http://localhost:11434/v1` and Local on are saved with it.
- Given the person types 70 as the Turn limit and leaves the box,
  when the section checks it,
  then "Enter a whole number from 1 to 64." shows and nothing is saved.
- Given the settings file can't be written and the person switches Connector tools off,
  when the save fails,
  then the switch is on again, "Couldn't save connector tools on this computer." shows under it, and the dialog says so with "Connector tools are back on."
- Given the CLI changes the saved Turn limit to 20 while the section is open,
  when the settings change,
  then the Turn limit box reads 20.
