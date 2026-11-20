# Decision: `halonic trust` refuses a stray word

- Task: HAL-14124
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14124 (found in Nina's docs check C314, HAL-14111; a CLI usage error and small wording of an approved screen, team decision under the HAL-2282 rule; Liam's code review signs this note with the pull request)
- Kind: user-visible

## What changes

- `cli.commands.trust.review-and-trust`: a word after `trust`, such as `halonic trust revoke`, is wrong usage (exit 2) and changes no trust. The problem line is "halonic trust takes only options, and you gave revoke."; the fix is "Did you mean --remove?" for a word that means an option (`revoke`, `remove`, `delete`, `forget`, `untrust` mean `--remove`; `list` and `ls` mean `--list`; any word within two edits of one), and otherwise "Run halonic trust --help to see its options.", as for an unknown option.
- `studio.untrusted-starts-nothing`: the text and its example name the real command, `halonic trust --remove`, in place of `halonic trust revoke`. No behaviour changes.

## Why

`trust` read only its options and dropped any other word, so `halonic trust revoke` on a trusted workspace printed "✓ Acme is already trusted on this computer." and kept the trust: the opposite of what was typed, and the command our own requirement named. Other commands already refuse extra words as wrong usage.

Studio's Trusted sources line "… is kept separately." was wrong too: the desktop shell and the CLI keep their trust records in one profile folder (HAL-2612, `crates/profile` and `crates/trust-store`), and #3999 relies on that. HAL-12642 (#3707) already changed that line to "Trust given with the `halonic` command shows here too.", so this note doesn't touch `workspace.trusted-sources`.

## Decided by the team

- A word is refused even with other options, so `trust revoke --dir acme` never trusts or removes. The plugin form (`--plugin <id>`) is refused the same way.
- The signed notes `decisions/elena/HAL-12799-trust-removed-closes-engine.md` and `decisions/elena/HAL-12811-harness-step-trust.md` still say `halonic trust revoke`. They stay as signed; this note is their correction: the command is `halonic trust --remove`.
- The website's copy of the old Trusted sources line (`security/index.md`) is fixed by Kim in website#474.

## Covers

- cli.commands.trust.review-and-trust
- studio.untrusted-starts-nothing
