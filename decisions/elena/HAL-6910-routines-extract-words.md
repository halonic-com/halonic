# Decision: extract's words follow cli-output revision 50

- Approval: decided on [HAL-6910](/HAL/issues/HAL-6910) (Sofia's check of cli-output revision 50 on HAL-6886), small wording on approved output, a team decision with no board card (HAL-2282); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L01RiQ4lDhegE6d9H/VPp5MW27dkoHdV6bV27F5vfIjiDP9umrRXT2dRh11hVqJdx8d8xORPO2QKWQM5VqyXCw==
- Task: HAL-6910

## What changes

`cli.commands.extract.extract-hub`: the ✓ line ends "The workspace home is unchanged." instead
of "home is unchanged.", so the sentence no longer starts with a lowercase folder name. The
refusal for a workspace with errors says "the workspace has 1 error, which the copy would
keep." and its fix now repeats the user's `--dir`: "Run halonic validate --dir ./home to see
what to fix, then extract again." The example for it names the workspace and the command, so
it can show that fix. The first example's shared items now read "skills: tone", as the golden
file and the code already did. The usage line is `<hub> <new-folder>`. No example was removed or
weakened.

`apps/cli/src/commands/extract/golden/extracted.txt`: the same ✓ line, in colour and without.

## Why

cli-output revision 50 (sections 3.11 and 3.12) writes down every line `extract` and `routines`
print. "and a copy would keep them" was wrong for one error, and a fix without the user's
`--dir` gives a command that doesn't work where they typed it (section 3, "Which folder").

## Covers

- cli.commands.extract.extract-hub
- apps/cli/src/commands/extract/golden/extracted.txt
