# mcp.program-starter

- Status: active
- Since: 0.1.0
- Source: HAL-230 (Liam's approval, change 3, 10 Nov 2026); HAL-188 (never run a skill's scripts); HAL-4777 (the connector's own `env`); HAL-4759 (harness agents' working folders)

The Node program starter shall refuse a program, an argument, a folder or a value the connector file sets in its `env` under a skill's `scripts/` folder, read as `format.program-start-paths` lists them, as written, resolved against the folder it starts in, or through a symbolic link, before anything starts. It shall not read the rest of the environment, the app's own variables and the secret values, for this. When the launch names the harness agents' working folders, it shall refuse, before anything starts, a launch that `format.working-folder-start` finds reaching one of them, reading the same values of `env` and no others, and the same for the program as it found it on `PATH`, with a message naming the working folder. It shall start the program with array arguments, no shell and only the environment it is given. On macOS and Linux it shall start the program in its own process group, so that stopping the program also stops the programs it started, and kill what is left of the group once the program ends. On Windows it shall end the whole process tree with `taskkill` from the system folder.

## Examples

- Given an argument `innocent/run.js` where `innocent` links to `skills/acme/scripts`,
  when the program is started,
  then it is refused and nothing starts.
- Given the working folder `files/agents/coder` and a launch started in the workspace, whose `node_modules/mail-mcp` links to `files/agents/coder`,
  when the program is started,
  then it is refused, naming the working folder, and nothing starts.
- Given a program that started a child which ignores SIGTERM,
  when the program is stopped,
  then the child has ended too.
- Given a `PATH` the app inherits, or a secret value, that names a skill's `scripts/` folder,
  when the program is started,
  then it isn't refused for that.
