# settings.ai-agent-prefs

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.device-wide` (U28); flow-settings 7 and 11 (HAL-646); HAL-6159

The Settings feature shall keep the Assistant's settings (Provider, Model, Base URL, Secret name, Local, Turn limit, Connector tools and Instructions) as host settings: saved where Halonic runs, used for new assistant chats in every workspace on that computer, and never written to a workspace file. It shall keep only the name of the key, never the key. A saved value that doesn't fit its setting shall read as the setting's default, without an error: Provider Not set up, Model, Base URL, Secret name and Instructions empty, Local off, Turn limit 16 and Connector tools on.

## Examples

- Given nothing is saved,
  when the Assistant's settings are read,
  then the Provider is Not set up, the Turn limit is 16 and Connector tools are on.
- Given the saved Turn limit is 200 or "many",
  when the Turn limit is read,
  then it is 16.
- Given the saved Provider is a name the Studio doesn't know,
  when the Provider is read,
  then it is Not set up.
