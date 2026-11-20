# Decision: `halonic trust` refuses a stray word, and Studio says CLI trust is listed too

- Task: HAL-14124
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14124 (found in Nina's docs check C314, HAL-14111; a CLI usage error and small wording of an approved screen, team decision under the HAL-2282 rule; Liam's code review signs this note with the pull request)
- Kind: user-visible

## What changes

- `cli.commands.trust.review-and-trust`: a word after `trust`, such as `halonic trust revoke`, is wrong usage (exit 2) and changes no trust. The problem line is "halonic trust takes only options, and you gave revoke."; the fix is "Did you mean --remove?" for a word that means an option (`revoke`, `remove`, `delete`, `forget`, `untrust` mean `--remove`; `list` and `ls` mean `--list`; any word within two edits of one), and otherwise "Run halonic trust --help to see its options.", as for an unknown option.
- `studio.untrusted-starts-nothing`: the text and its example name the real command, `halonic trust --remove`, in place of `halonic trust revoke`. No behaviour changes.
- `workspace.trusted-sources`: the desktop's last line reads "Trust given with the `halonic` command is listed here too." in place of "… is kept separately."

## Why

`trust` read only its options and dropped any other word, so `halonic trust revoke` on a trusted workspace printed "✓ Acme is already trusted on this computer." and kept the trust: the opposite of what was typed, and the command our own requirement named. Other commands already refuse extra words as wrong usage.

The Trusted sources line was wrong. The desktop shell and the CLI keep their trust records in one profile folder (HAL-2612, `crates/profile` and `crates/trust-store`), the section lists that folder's records through the shell, and removing one there removes it for the CLI too. #3999 relies on that.

## Decided by the team

- A word is refused even with other options, so `trust revoke --dir acme` never trusts or removes. The plugin form (`--plugin <id>`) is refused the same way.
- The signed notes `decisions/elena/HAL-12799-trust-removed-closes-engine.md` and `decisions/elena/HAL-12811-harness-step-trust.md` still say `halonic trust revoke`. They stay as signed; this note is their correction: the command is `halonic trust --remove`.
- The line in Trusted sources is changed, not dropped, so a person who trusted a folder in a terminal knows why it shows up here. The website's copy of the old line (`security/index.md`) is Nina's to file for Kim.

## Covers

- cli.commands.trust.review-and-trust
- studio.untrusted-starts-nothing
- workspace.trusted-sources
