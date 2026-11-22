# Decision: the CLI's fix for `setup-needed` names `halonic sandbox setup`

- Approval: Paperclip tasks HAL-15808 (flow check C634 #4 on HAL-15803), small wording on approved CLI output, a team decision with no board card (HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kWOt4JcQRENFRTdpOXDyEUS7wZiyYxBoOoWxCGIfqx0AAROrx7kJiJrfIkS/BYH9FcVt05iPOwud66lc/RZgAg==
- Task: HAL-15808, HAL-15815

## What changes

**Settings › Agent sandbox.** The "set up again" lead (C633, HAL-15815) landed on `main` while this PR waited, so this PR no longer changes Settings.

**The CLI.** On Windows without srt's install, the sandbox check reports `setup-needed`, and the CLI told the
user to "Use Halonic inside WSL 2 on this computer" (HAL-7540). Since then `halonic sandbox setup`
has shipped on `main`: it runs the same install as Studio and the installer, with one
administrator prompt (`apps/cli/README.md`, `docs/security/sandbox.md`). So the fix sent the user
away from a command that fixes it. In `apps/cli/src/messages/sandbox.ts`, for `setup-needed` only:

- a refused `run` or `runs send` now says "The sandbox's one-time setup isn't done for this
  version of Halonic. Set it up with halonic sandbox setup, then run it again.";
- `halonic doctor`'s fix is "Fix: set it up with halonic sandbox setup. Windows asks for
  administrator rights once. Then run halonic doctor again.";
- the plugin commands' "off on this computer" line ends "Set it up with halonic sandbox setup.
  Windows asks for administrator rights once.".

`windows`, `distro-missing` and `setup-conflict` keep the WSL 2 fix: the CLI's harness agents
still get `windows` on every plain Windows (`runnerFence`), and whether `halonic sandbox setup`
fixes the other two isn't proven.

In `cli.sandbox-gate` and `cli.commands.plugin.off-here`, the Windows example's expected words
change to match, and each `Source` line adds HAL-15808. No other sentence changes, and no test is
removed or weakened: the tests assert the new words, word for word.

## Covers

- cli.sandbox-gate
- cli.commands.plugin.off-here
