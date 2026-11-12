# Decision: plugin lines name only add <folder> and list

- Approval: Liam decided this on [HAL-6426](/HAL/issues/HAL-6426) (Kim's docs check on HAL-6402), small wording on an approved screen, a team decision with no board card; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hj2OmcCmKVywepJVXvG0K2A4FNe6q/fMTzeDSzXCaMVpgouI7Pk42dYjVOUl7KaSo1fcDH4ldsjgRdag1ujLCw==
- Task: HAL-6426

## What changes

`cli.commands.plugin.list`: with no plugins it says "No plugins yet. Add one from a folder with
halonic plugin add <folder>." instead of offering a git address. The example keeps its shape,
only the sentence changes.

`cli.commands.plugin.add`: the example for a plugin that is already added also names its fix,
"See it with halonic plugin list.", which replaces the pointer to `halonic plugin remove`. The
refusal itself (conflict, nothing written, exit 5) is unchanged. No example was removed or
weakened.

## Why

`halonic plugin add` takes a folder only and there is no `plugin remove` yet, but the lines users
see offered both. Install builds `main` (HAL-6032), so users meet these lines now. HAL-1736, which
builds git sources and `plugin remove`, puts cli-output 3.6's wording back with those commands.
The `halonic trust --plugin <id>` lines stay: that command gets built on HAL-6438, because nothing
else can turn on a plugin that's off.

## Covers

- cli.commands.plugin.add
- cli.commands.plugin.list
