# settings.ai-agent-connection

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); flow-settings 7 (HAL-646); microcopy 13 and 14

The Settings feature shall show a "How it connects" row under Model once a provider is set, and not before: Base URL, Secret name and Local, each saved by itself like the other Assistant fields. The row shall be closed, unless the provider is OpenAI-compatible and has no Base URL, or OpenAI-compatible was just picked: then it shall be open, with the focus in Base URL. Local shall read "On for a model that runs on this computer or your own network. A local-only workspace can only use local models." When a save of Local fails, the switch shall go back and the section shall say so under it and in the dialog.

## Examples

- Given the provider is Not set up,
  when the section opens,
  then there is no "How it connects" row.
- Given the person picks OpenAI-compatible,
  when the pick is saved,
  then How it connects is open and the focus is in Base URL.
- Given the person types "localhost" as the Base URL and leaves it,
  when the section checks it,
  then "Enter a full address, like http://localhost:8000/v1." shows and nothing is saved.
