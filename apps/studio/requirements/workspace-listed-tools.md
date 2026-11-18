# studio.workspace-listed-tools

- Status: active
- Since: unreleased
- Source: HAL-8868 (step 6, part 4b); Liam's decision on HAL-2213 (part 4); HAL-12413 (UX check C2)

When the Library asks for a connector's listed tools, the desktop app shall read them the way `halonic tools review` does: it shall check that the workspace is trusted as it is now, start the connector through the agent host with the workspace's grant, its own secrets and the agents' working folders, and show what the server lists now against the approvals the CLI keeps. If the workspace is not trusted, it shall start nothing and say so. When the agent host says why the connector couldn't list its tools (a missing program, a secret that isn't set or was refused, a program that stopped), it shall pass the cause and its name on for the page to word, naming a refused secret only when the connector has just one, since the server doesn't say which; an engine that isn't answering shall reach the page as it is. It shall approve a tool only at the version the person was shown, and name the tools whose version changed in the meantime. It shall start no `http` connector and no Google connector, and open their pages with nothing to review rather than a failure line.

## Examples

- Given a trusted workspace whose `notes` connector lists `read_note`,
  then the review shows `read_note` as not approved.
- Given a workspace that changed since it was trusted,
  then the review starts no program and says the workspace isn't trusted yet.
- Given `read_note` was shown at one version and its server lists another now,
  when the person approves,
  then nothing is approved for it, and it is named as changed.
- Given a connector whose program `npx` isn't on this computer,
  then the review is refused with that cause and the program's name.
- Given a connector with one secret, which its server refused,
  then the review is refused with that cause and the secret's name.
- Given an `http` connector,
  then nothing starts, and the review opens with no tools and no failure line.
