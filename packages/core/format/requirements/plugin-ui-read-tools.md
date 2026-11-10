# format.plugin-ui-read-tools

- Status: active
- Since: 0.1.0
- Source: the plugins ADR (`docs/adr/2026-11-09-plugins.md`, section 1.4) for cards; HAL-1819 (Elena, for P7), recorded on HAL-1734, for commands: both run outside a run, where `checkOutsideRunCall` refuses every tool that isn't `read`

When a `plugin.yaml` passes its schema, every `ui` command and card shall name a declared tool whose `risk` is `read`; for a tool with another risk, the format shall report `tool-not-read` at its `tool`, with a message that names the command or card, its id, the tool and what the tool does (`writes` or `sends`).

## Examples

- Given a command and a card that name `read` tools, when the plugin is parsed, then there is no problem.
- Given a command that names a backend tool with `risk: send`, when the plugin is parsed, then there is one `tool-not-read` problem whose message names the command, its id, the tool and `sends`.
- Given a card that names a local tool with `risk: write`, when the plugin is parsed, then there is one `tool-not-read` problem for the card, with `writes`.
- Given a command that names a tool that doesn't exist, when the plugin is parsed, then there is only the `tool-not-found` problem, none about its risk.
- Given two commands and a card that each name a tool that writes or sends, when the plugin is parsed, then there are three `tool-not-read` problems, one for each, not just the first.

## Deliberate limits in v0.1

- Write and send commands are a later design, after v0.1. Cards stay read-only even then, because they refresh on their own.
- A connector's own `approve` and `allow` lists are the person's settings, not the plugin's, so they can't be checked here; `checkOutsideRunCall` still refuses at run time.
