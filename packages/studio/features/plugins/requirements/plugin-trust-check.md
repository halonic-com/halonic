# plugins.plugin-trust-check

- Status: draft
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 5 (HAL-1739); microcopy 24 T6 to T10 (HAL-751); UX acceptance checklist 4 (HAL-1952); CHECK P1 (HAL-1804)

The Studio shall show a plugin's trust check as a dialog without ✕, with **Not now** focused and Escape as **Not now**, the title "Trust *name* and turn it on?" right after Add, or "Trust *name*?" from **Review**, and a summary in risk order that leaves out zero counts: the tools for agents and how many of them change things or send, then the programs it starts on this computer, the secrets it sends and the addresses it reaches. It shall show, each only when it has something and in this order: Tools for agents, open by itself when a tool changes things or sends, with "Agents can use these through a connector. Each one asks a person first." and each tool's name, its risk ("Reads", "Changes things" or "Sends"), its description in quotes and "its answers are treated as outside text" when the plugin marks them so; Programs on this computer, with each full command, "In the agent sandbox, in its own empty folder", its pinned version and what it can reach; Secrets, with where each goes only to and how, and, under them, for a backend's secret "You enter its value in *name*'s settings. The plugin's code never sees it." and for a program's secret "You enter its value in *name*'s settings. Halonic gives it to the program when it starts.", each line once; Addresses, one per line, "(the program)" after one only a program reaches; and In Studio, with "Halonic draws these itself. Text from the plugin is shown as plain text." and its settings, commands, cards and panel. Its last line shall be "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given.", written in one place. Its buttons shall be **Not now** and **Trust and turn on** after Add, or **Trust** from **Review**. When trust can't be saved, the dialog shall stay open and say "Couldn't save trust: *reason*. Nothing was started." It shall show no secret's value, and all of the plugin's text as plain text.

## Examples

- Given the Weather plugin adds the read tool `forecast` and the write tool `set_alert`, starts the program `npx weather-mcp@1.2.3` with the read tool `radar`, sends the secret `api-key` to api.example.com and reaches api.example.com and radar.example.com,
  when its trust check opens after Add,
  then the title is "Trust Weather and turn it on?" and the summary is "Adds 3 tools for agents, 1 of which changes things. Starts 1 program on this computer, sends 1 secret to api.example.com and reaches 2 addresses."
- Given a plugin with one tool, which sends,
  when its trust check opens,
  then the summary starts "Adds 1 tool for agents, which sends."
- Given a plugin with a command and a card, and no settings or panel,
  when its trust check opens,
  then In Studio reads "1 command and 1 card".
- Given a backend secret sent as a bearer token,
  when the trust check lists it,
  then How says "Authorization header".
- Given a plugin whose only secret belongs to a program,
  when the trust check lists its secrets,
  then it says "You enter its value in Acme's settings. Halonic gives it to the program when it starts." and not that the plugin's code never sees it.
- Given the address of a setting "Server",
  when the trust check lists where a secret goes,
  then it says "the address you enter under Server".
- Given the trust check is open,
  when the person presses Escape,
  then it is the same as **Not now**.
- Given saving trust fails because the disk is full,
  when the person pressed **Trust and turn on**,
  then the dialog stays open and says "Couldn't save trust: the disk is full. Nothing was started."
