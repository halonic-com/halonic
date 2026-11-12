# Decision: trust --plugin gives the current fingerprint and checks it when already on

- Approval: Liam asked for these follow-ups in his review of #1992 on [HAL-6647](/HAL/issues/HAL-6647) and made them task [HAL-6666](/HAL/issues/HAL-6666); the package owner (Liam) approves this note in review on [HAL-6676](/HAL/issues/HAL-6676)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:04l5B/Pt5VSAIaJ8UKxH+KJS2wRwn1HVnHpjqHYBf1QYn0dl+FnAC3xRAlEAXP8UpH2cZ1xJvnmh2MiYi9HmAg==
- Task: HAL-6666

## What changes

`cli.commands.trust.plugin` gets three clarifications. Nothing in it is removed or weakened:

- A `--fingerprint` that isn't the current one changes nothing and exits 3, also when the plugin is
  already on. Before, an already-on plugin exited 0 whatever fingerprint was given.
- When the files change between the check and the answer, the refusal ends with the fingerprint the
  files have now, not the one that was shown.
- `--plugin <id> --remove` asks nothing, so it ignores `--yes` and `--fingerprint`, like workspace
  `trust --remove`. Before, `--remove --yes` was wrong usage (exit 2).

One example is added: an already-on plugin with a fingerprint that isn't current stays on and exits 3.

## Why

These make `trust --plugin` match workspace `trust` and its own requirement, which already said that
a fingerprint that isn't the current one exits 3. A script that retries after a refusal can now pass
the last line it was given to `--yes --fingerprint`.

## Covers

- cli.commands.trust.plugin
