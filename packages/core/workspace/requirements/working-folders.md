# workspace.working-folders

- Status: active
- Since: 0.1.0
- Source: Julian's security review of halonic#1499 on HAL-4728; task HAL-4732

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error, at the agent's `workingFolder`, every harness agent (one whose `harness` is set and isn't `halonic`) whose working folder, or `files/agents/<id>` when it names none, holds a path a local connector starts in or names: the connector's `cwd`, its `command`, any of its `args`, or the value after the first `=` of an argument. The program and the arguments are read from the connector's `cwd`. The paths are compared as a file system that ignores case reads them, with `\` as `/`, `.` and `..` parts resolved and trailing dots and spaces dropped from each part. Every local connector counts, pinned or not. One error is reported per agent and connector.

The reason: a harness agent writes in its working folder from inside the sandbox, while a local connector's program runs outside it, with the connector's secrets. A program or a file it reads in a working folder would let the agent change what runs outside the sandbox with no change recorded for review.

An absolute path, or one that leaves the workspace, isn't compared here: whoever starts the program knows where the workspace is and checks those.

## Examples

- Given a Claude Code agent with `workingFolder: scripts` and a connector that runs `bash` with `scripts/mail.sh`, when it is loaded, then the agent gets the error `working-folder-runs-program` at `workingFolder`, naming the connector and `scripts/mail.sh`.
- Given the same connector and an agent with `workingFolder: files/reports`, when it is loaded, then there is no error.
- Given a Codex agent with no `workingFolder` and a connector that starts in `files/agents/coder/server`, when it is loaded, then the agent gets the error.
- Given a connector that runs `./run.sh` from `cwd: tools`, or names `--config=tools/mail.json`, and an agent with `workingFolder: Tools`, when it is loaded, then the agent gets the error.
- Given a connector that names `scripts-old/mail.sh` or `/opt/mail/run.sh` and an agent with `workingFolder: scripts`, when it is loaded, then there is no error.
- Given an agent in Halonic's own loop with `workingFolder: scripts`, when it is loaded, then there is no error, as it starts no program.
