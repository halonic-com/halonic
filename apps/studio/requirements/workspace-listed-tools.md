# studio.workspace-listed-tools

- Status: active
- Since: unreleased
- Source: HAL-8868 (step 6, part 4b); Liam's decision on HAL-2213 (part 4); HAL-12413 (UX check C2); HAL-12340; HAL-15809 (C634 #5)

When the Library asks for a connector's listed tools, the desktop app shall read them the way `halonic tools review` does: it shall check that the workspace is trusted as it is now, start the connector through the agent host with the workspace's grant, its own secrets and the agents' working folders, and show what the server lists now against the approvals the CLI keeps, kept to the tools the connector's `tools.allow` offers to agents. If the workspace is not trusted, it shall start nothing and say so. When the agent host says why the connector couldn't list its tools (a missing program, a secret that isn't set or was refused, a program that stopped), it shall pass the cause and its name on for the page to word, with every secret the connector declares for a refused one, since the server doesn't say which, and for a program that stopped right after it started the connector file's path in the workspace and, except for a Windows folder, the line that starts it by hand: `cd` to the folder it starts in (`cwd` from the workspace folder), then its command and args, each one POSIX shell word, without its `env` or secrets; an engine that isn't answering shall reach the page as it is. It shall approve a tool only at the version the person was shown, and name the tools whose version changed in the meantime. It shall start no `http` connector and no Google connector, and open their pages with nothing to review rather than a failure line.

## Examples

- Given a trusted workspace whose `notes` connector lists `read_note`,
  then the review shows `read_note` as not approved.
- Given the `notes` connector lists `read_note` and `delete_note` and its `tools.allow` names only `read_note`,
  then the review shows `read_note` only.
- Given a workspace that changed since it was trusted,
  then the review starts no program and says the workspace isn't trusted yet.
- Given `read_note` was shown at one version and its server lists another now,
  when the person approves,
  then nothing is approved for it, and it is named as changed.
- Given a connector whose program `npx` isn't on this computer,
  then the review is refused with that cause and the program's name.
- Given a connector in `library/connectors/notes.connector.yaml` with the command `sh` and the args `-c` and `exit 1`, whose program stopped right after it started, in the workspace folder `/acme/Acme sample`,
  then the review is refused with that cause, the program's name, the file and the line `cd "/acme/Acme sample" && sh -c "exit 1"`.
- Given a connector with one secret, which its server refused,
  then the review is refused with that cause and the secret's name.
- Given a connector with two secrets, and its server refused one,
  then the review is refused with that cause and both secrets' names.
- Given an `http` connector,
  then nothing starts, and the review opens with no tools and no failure line.
