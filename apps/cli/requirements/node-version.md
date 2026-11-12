# cli.node-version

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504); replaces the shebang on `src/main.ts` from HAL-6000

The `halonic` command shall start from `bin/halonic.cjs`, written in JavaScript that Node 12 can read. Before it loads anything else, it shall compare the Node version it runs on with 26.12. On an older Node it shall print one line on stderr with the version it found, that Halonic needs Node.js 26.12 or later, and how to get it with nvm, load nothing else, and exit with 1. On Node 26.12 or later it shall run `src/main.ts` with the same arguments. `package.json` shall name the launcher as `bin.halonic` and require Node `>=26.12` under `engines`.

## Examples

- Given Node 18.19.1,
  when `halonic --help` runs,
  then it prints "✕ Halonic needs Node.js 26.12 or later, but this is Node.js 18.19.1. Install a newer one, for example with nvm install 26." on stderr, nothing on stdout, and exits with 1.
- Given Node 26.11.0,
  when `halonic --help` runs,
  then it refuses the same way.
- Given Node 26.12.0,
  when `halonic --help` runs,
  then it prints the help and exits with 0.
