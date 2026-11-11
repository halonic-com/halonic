# format.working-folder-start

- Status: active
- Since: 0.1.0
- Source: Julian's conditions on HAL-4739 for wiring `workingFolder`, planned on HAL-4759

The format shall tell whether a local connector's program start would run or load a file from a harness agent's working folder, checked on the real file system so every adapter that starts a program refuses the same starts. It looks at the start folder, the program and every path its arguments and `env` values name (split as in `workspace.working-folders`), as resolved from the start folder and through symbolic links and Windows short names, with a path that doesn't exist yet followed as far as it does. It looks at every entry, `.bin` entry and scoped package of the `node_modules` folders from the start folder up to the workspace root. It looks at the folder of each script the start runs, and the folder it starts in unless that is the workspace root. Paths are compared without regard to case, with `\` as `/` and trailing dots and spaces dropped. With no working folders, nothing is found.

## Examples

- Given a working folder `files/agents/coder` and `node tools/run.js`, where `tools/run.js` is a link to `files/agents/coder/run.js`,
  when it is checked,
  then it reaches the working folder.
- Given the same working folder and `npx mail-mcp` started in a folder whose `node_modules/mail-mcp` is a pnpm link to `files/agents/coder`,
  when it is checked,
  then it reaches the working folder.
- Given the same working folder and `node server.js`, with `server.js` in the workspace root,
  when it is checked,
  then it reaches the working folder, since the program loads files from next to its script.
- Given the same working folder and `npx -y mail-mcp@1.2.3`, started in a new empty folder outside the workspace,
  when it is checked,
  then it does not.
- Given the same working folder and `node tools/mail/server.js`,
  when it is checked,
  then it does not.
