# Decision: the CLI's plugin trust check names no Studio

- Approval: a team decision on [HAL-6417](/HAL/issues/HAL-6417), following Liam's decision on
  [HAL-6183](/HAL/issues/HAL-6183) that 0.1 output sends no one to Studio; the wording is checked
  by Sofia, and Liam approves this note in review
- Kind: internal
- Task: HAL-6417

## What changes

`halonic plugin add` shows the plugin's trust check before it asks. Two parts of it still named
Studio, which 0.1 doesn't have:

- The "In Studio" section, with its rows Settings, Commands, Cards and Panel, is gone. 0.1 has
  nothing that draws a plugin's settings, commands, cards or panel, so the section listed things
  the user can't see or use.
- The last line now reads "Plugin code runs apart from the rest of Halonic. Halonic doesn't check
  what the plugin does with what it's given." This stays true in 0.1: a plugin's backend runs in
  the I5 worker and its local programs in the sandbox.

`halonic plugin list` named no Studio and doesn't change.

## Why

The other sections list what the plugin's code can do and reach: its tools, programs, secrets
and addresses. Those stay exactly as they are. The plugin's `ui` carries no code (plugins
decision record, "There are two fences and no third"), so leaving its rows out hides nothing the
plugin can do. Trust still covers the whole fingerprint, `ui` included, as before. When Studio
ships, its own trust check shows the In Studio section, and the CLI can show it again then.

## Covers

- cli.commands.plugin.add
