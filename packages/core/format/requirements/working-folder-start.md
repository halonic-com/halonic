# format.working-folder-start

- Status: active
- Since: 0.1.0
- Source: Julian's conditions on HAL-4739 for wiring `workingFolder`, planned on HAL-4759

The format shall tell whether a local connector's program start would run or load a file from a harness agent's working folder, checked on the real file system so every adapter that starts a program refuses the same starts. It looks at the start folder, the program and every path its arguments and `env` values name (split as in `workspace.working-folders`), as resolved from the start folder and through symbolic links and Windows short names, with a path that doesn't exist yet followed as far as it does. It looks at every entry, `.bin` entry and scoped package of the `node_modules` folders from the real start folder, from the real folder of each script the start runs and from each workspace package linked into one of them, up to the real workspace root. It looks at the folder of each script the start runs, and the folder it starts in unless that is the workspace root. A script is the program, an argument or a piece of one that is a file, an argument or `-m` module that is a file once Node or Python add an ending (`.js`, `.mjs`, `.cjs`, `.ts`, `.json`, `.node`, `.py`), or an argument that is a folder. Paths are compared without regard to case, with `\` as `/` and trailing dots and spaces dropped. With no working folders, nothing is found.

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
- Given the same working folder and `node tools/chat/server.js`, where `tools/chat/node_modules/helper` is a link to `files/agents/coder`,
  when it is checked,
  then it reaches the working folder, since `require()` looks from the script's folder.
- Given the same working folder and `npx mail-mcp`, where `node_modules/mail-mcp` links to the workspace package `packages/mail-mcp` and its `node_modules/helper` links to `files/agents/coder`,
  when it is checked,
  then it reaches the working folder.
- Given the same working folder and `node server` or `node .`, with `server.js` in the workspace root,
  when it is checked,
  then it reaches the working folder.

## Limits

- Code passed inline, as in `node -e "require('./files/agents/coder/x')"`, isn't read, as in the static check `workspace.working-folders`. The start is written by the user.
- Packages in pnpm's store (`node_modules/.pnpm`) aren't followed into their own `node_modules`, so a workspace package that is only a dependency of a store package isn't found.
