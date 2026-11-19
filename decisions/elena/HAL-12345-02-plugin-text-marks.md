# Decision: plugin.yaml refuses control characters and text-direction marks in its text

- Task: HAL-12345 (finding L5 of the P10 security review, HAL-1743)
- Approval: the task asks for this change; Liam approves this note in review on HAL-12345
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1AVVuNEWr7NN1b2WQ886SATMalzPsMi00fNoPSEqb7ArETKs7zgTImWgilotMwSgqvKQWOe7X70/CU5oCmAODw==

## What changes

- `format.plugin-file`: the `name`, every `label` and `title` and every `help` and `description` may not contain a control character (Unicode `Cc`) or a text-direction mark (Unicode `Bidi_Control`). A `help` or `description` may still break lines. Right-to-left letters and emoji still pass. The published `plugin.schema.json` doesn't change.
- `cli.commands.plugin.add` and `cli.commands.plugin.remove`: each had a test that added a plugin whose name held an escape character, to check that the CLI escapes it. Such a plugin can no longer be added, so the two tests change:
  - `add` checks that the plugin is refused with "don't use control characters or text-direction marks", that nothing is written and that the escape character is never printed.
  - `remove` edits `plugin.yaml` after adding, so the name holds an escape character, and checks that `remove` still removes the plugin by its id and never prints that name.

## Why

A right-to-left override or another hidden character can make one plugin's name look like another's, in the list and in the trust question. Refusing these characters when the file is read covers every place the text is shown, in Studio and in the CLI.

## Tests

`plugin.test.ts` adds tests for every field and for each kind of character, and for the text that still passes. The `add` test has fewer expect calls than before, because a refused plugin has no trust question or result lines left to check; that drop is intended and listed below. The CLI's own escaping is unchanged and still covered by the `remove` test.

## Covers

- format.plugin-file
- cli.commands.plugin.add
- cli.commands.plugin.remove
- apps/cli/src/commands/plugin/add.test.ts
- apps/cli/src/commands/plugin/remove.test.ts
