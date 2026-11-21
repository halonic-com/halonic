# settings.about-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404 (update pre-flight, plan-pr2 part A); wording decided by the team in HAL-14804

When the updater says the update it found or has ready raises srt's Windows setup version, Studio installs that update itself, and the agent sandbox on this computer is set up (ready, or set up but needing a repair), Settings › About Halonic shall show "After this update, Windows asks for administrator rights once to set up the agent sandbox again." under **Download** or **Restart to update**, in the muted helper style and without an icon or a warning colour. It shall ask the sandbox's check only for such an update, and shall show no line while the check hasn't answered, when it can't answer, where the sandbox isn't set up, or when another tool manages updates.

## Examples

- Given an update ready that raises the setup version and a sandbox that is ready,
  when About Halonic opens,
  then the line shows under Restart to update.
- Given the same update and a sandbox that needs setting up,
  when About Halonic opens,
  then no line shows.
- Given an update that doesn't raise the setup version,
  when About Halonic opens,
  then no line shows and the sandbox's check isn't asked.
- Given Scoop manages updates,
  when an update that raises the setup version is out,
  then no line shows.
