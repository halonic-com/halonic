# Decision: `halonic trust` refuses a stray word

- Task: HAL-14124
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14124 (found in Nina's docs check C314, HAL-14111; a CLI usage error and small wording of an approved screen, team decision under the HAL-2282 rule; Liam's code review signs this note with the pull request)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4ZjFH8cSztWCsXR1zp+3xb9qqXv3/hFbmo6sRq7k/rWhO5BlhzLgnK6o/4gPpA6oytmvN32gVDPOTkk4bRr+CA==

## What changes

- `cli.commands.trust.review-and-trust`: a word after `trust`, such as `halonic trust revoke`, is wrong usage (exit 2) and changes no trust. The problem line is the one every command that takes no arguments gives since #3708 (HAL-12639): "halonic trust takes no arguments, and you gave revoke.". The fix is "Did you mean --remove?" for a word that means an option (`revoke`, `remove`, `delete`, `forget`, `untrust` mean `--remove`; `list` and `ls` mean `--list`; any word within two edits of one), through the command's `strayArgumentFix`, and otherwise #3708's "To use the workspace in acme, run halonic trust --dir acme.".
- `studio.untrusted-starts-nothing`: the text and its example name the real command, `halonic trust --remove`, in place of `halonic trust revoke`. No behaviour changes.

## Why

`trust` read only its options and dropped any other word, so `halonic trust revoke` on a trusted workspace printed "✓ Acme is already trusted on this computer." and kept the trust: the opposite of what was typed, and the command our own requirement named. #3708 (HAL-12639), merged after this was found, now refuses the word for every command that takes none, but its fix for `trust revoke` was "To use the workspace in revoke, run halonic trust --dir revoke.", which points away from what was meant.

Studio's Trusted sources line "… is kept separately." was wrong too: the desktop shell and the CLI keep their trust records in one profile folder (HAL-2612, `crates/profile` and `crates/trust-store`), and #3999 relies on that. HAL-12642 (#3707) already changed that line to "Trust given with the `halonic` command shows here too.", so this note doesn't touch `workspace.trusted-sources`.

## Decided by the team

- A word is refused even with other options, so `trust revoke --dir acme` never trusts or removes. The plugin form (`--plugin <id>`) is refused the same way. Both come from #3708's check in `runCli`; this change only adds `trust`'s own fix line.
- The signed notes `decisions/elena/HAL-12799-trust-removed-closes-engine.md` and `decisions/elena/HAL-12811-harness-step-trust.md` still say `halonic trust revoke`. They stay as signed; this note is their correction: the command is `halonic trust --remove`.
- The website's copy of the old Trusted sources line (`security/index.md`) is fixed by Kim in website#474.

## Covers

- cli.commands.trust.review-and-trust
- studio.untrusted-starts-nothing
