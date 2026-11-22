# studio.update-setup-again-skip-logged

- Status: active
- Since: unreleased
- Source: flow check C634 #4 (HAL-15803), task HAL-15808; follows `studio.update-setup-again` (HAL-5404) and #4809

When a silent update without administrator rights skips the sandbox step that `/SANDBOX=again` asks for, and srt's marker on the computer is lower than the setup version the installer's srt needs, the installer shall append "installer: Installing *version*: the agent sandbox wasn't set up again, because a silent update without administrator rights can't ask for them. Agents set to run in a sandbox don't start until it's set up again in Settings › Agent sandbox." to `updates.log` in the profile, since a silent run shows none of its own lines. Where the marker isn't lower, or can't be read, it shall write no such line.

## Examples

- Given a silent update without administrator rights, `/SANDBOX=again`, and srt's marker at 2 for an installer whose srt needs 3,
  when the update runs,
  then `updates.log` gets the line saying the sandbox wasn't set up again.
- Given the same update and no sandbox set up on the computer,
  when the update runs,
  then `updates.log` gets no such line.
