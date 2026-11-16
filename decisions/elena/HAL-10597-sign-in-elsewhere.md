# Decision: the sign-in command names the setup's ref, and the CLI says what it takes

- Approval: Liam approved the code on HAL-10696 and Sofia the UX on HAL-10695; the scope was decided on HAL-10682; Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-10597

## What changes

Step 7 of the Google setup, when the window isn't on the computer running Halonic, shows `halonic google sign-in <ref>` with the setup record's ref, and Copy copies the same text. Before, it showed the connector's address, which the command refuses with "no such account" (exit 4). The command still refuses an address, but its fix line now says it takes the setup's ref and that Studio's sign-in step shows it. Nothing was removed or weakened.

## Why

Studio's text and Copy button gave people a command that failed. The command's requirement is explicit that it takes the record's ref, and an address can be shared by several records, so the text changes, not the command.

## Decided by the team

- No command lists refs, so the fix line points to the Studio step and names no list command. Whether a `halonic google accounts` list is worth a task is Liam's call.
- Telling a served window on another computer from the desktop window moves to HAL-10697, because the agent host can't see a remote browser.

## Covers

- cli.commands.google.sign-in
- google-setup.sign-in-elsewhere
