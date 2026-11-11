# workspace.working-folders

- Status: active
- Since: 0.1.0
- Source: Julian's security review of halonic#1499 on HAL-4728; task HAL-4732

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error, at the agent's `workingFolder`, every harness agent (one whose `harness` is set and isn't `halonic`) whose working folder, or `files/agents/<id>` when it names none, holds a path a local connector starts in or names: the connector's `cwd`, its `command`, any of its `args`, or any plain `env` value. From an argument or `env` value it also reads each piece between `=`, `:`, `;`, `@` and spaces, each piece without a short flag written together with it (`-ctools/x.json`), and, for the argument after `-m` or one written as `-mname`, the module name with `.` read as `/`. The paths are read from the connector's `cwd`. `secretEnv` holds secret names and isn't read. The paths are compared as a file system that ignores case reads them, with `\` as `/`, `.` and `..` parts resolved and trailing dots and spaces dropped from each part. Every local connector counts, pinned or not. One error is reported per agent and connector.

It also reports as the same error a harness agent's working folder that lies inside a local connector's `cwd`, inside a path the connector names, or inside the folder such a path is in, unless that folder is the workspace root, and one that has a `node_modules` part anywhere, in any letter case, whatever the connectors are.

The reason: a harness agent writes in its working folder from inside the sandbox, while a local connector's program runs outside it, with the connector's secrets. A program or a file it reads in a working folder would let the agent change what runs outside the sandbox with no change recorded for review. Programs also load files they don't name: `npx` and `node` find packages in `node_modules`, and tools read `package.json`, `pyproject.toml` and virtual environments from the folder they start in, Node and Python load files next to the script they run, and they load modules from the folders in `NODE_PATH` and `PYTHONPATH`.

An absolute path, or one that leaves the workspace, isn't compared here: whoever starts the program knows where the workspace is and checks those, after symlinks and short names, along with the program as it is found on `PATH`, a file a program loads from the workspace root without naming it, and a workspace package that `node_modules` links to a working folder.

## Examples

- Given a Claude Code agent with `workingFolder: scripts` and a connector that runs `bash` with `scripts/mail.sh`, when it is loaded, then the agent gets the error `working-folder-runs-program` at `workingFolder`, naming the connector and `scripts/mail.sh`.
- Given the same connector and an agent with `workingFolder: files/reports`, when it is loaded, then there is no error.
- Given a Codex agent with no `workingFolder` and a connector that starts in `files/agents/coder/server`, when it is loaded, then the agent gets the error.
- Given a connector that runs `./run.sh` from `cwd: tools`, or names `--config=tools/mail.json`, and an agent with `workingFolder: Tools`, when it is loaded, then the agent gets the error.
- Given a connector that runs `python -m src.server`, or names `-csrc/x.json`, `@src/args.txt` or `file:src/x`, and an agent with `workingFolder: src`, when it is loaded, then the agent gets the error.
- Given a connector with `env` `NODE_OPTIONS: --require ./src/hook.js`, `PYTHONPATH: src`, `BASH_ENV: src/x.sh` or `PATH: /usr/bin:src/bin`, and an agent with `workingFolder: src`, when it is loaded, then the agent gets the error, naming the variable.
- Given an agent with `workingFolder: node_modules` or `files/node_modules/some-mcp`, when it is loaded, then it gets the error, with or without a connector.
- Given a connector with `cwd: tools` and an agent with `workingFolder: tools/lib`, when it is loaded, then the agent gets the error; given the same agent and a connector that starts in the workspace root, there is none.
- Given a connector that runs `node tools/server.js` or `python tools/server.py` from the workspace root and an agent with `workingFolder: tools/lib`, when it is loaded, then the agent gets the error, naming the script and `tools`.
- Given a connector with `env` `PYTHONPATH: src` and an agent with `workingFolder: src/pkg`, or `NODE_PATH: lib` and `workingFolder: lib/foo`, when it is loaded, then the agent gets the error.
- Given a connector that names `scripts-old/mail.sh` or `/opt/mail/run.sh` and an agent with `workingFolder: scripts`, when it is loaded, then there is no error.
- Given an agent in Halonic's own loop with `workingFolder: scripts`, when it is loaded, then there is no error, as it starts no program.
