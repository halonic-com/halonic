# studio.workspace-listed-tools

- Status: active
- Since: 0.1.0
- Source: HAL-8868 (step 6, part 4b); Liam's decision on HAL-2213 (part 4)

When the Library asks for a connector's listed tools, the desktop app shall read them the way `halonic tools review` does: it shall check that the workspace is trusted as it is now, start the connector through the agent host with the workspace's grant, its own secrets and the agents' working folders, and show what the server lists now against the approvals the CLI keeps. If the workspace is not trusted, it shall start nothing and say so. It shall approve a tool only at the version the person was shown, and name the tools whose version changed in the meantime. It shall start no `http` connector and no Google connector, and say so for `http`.

## Examples

- Given a trusted workspace whose `notes` connector lists `read_note`,
  then the review shows `read_note` as not approved.
- Given a workspace that changed since it was trusted,
  then the review starts no program and says the workspace isn't trusted yet.
- Given `read_note` was shown at one version and its server lists another now,
  when the person approves,
  then nothing is approved for it, and it is named as changed.
- Given an `http` connector,
  then nothing starts, and the review says Studio can't check it yet.
