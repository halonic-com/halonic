# cli.node-floor

- Status: active
- Since: 0.1.0
- Source: HAL-6414 (a clean install on Node.js 20.19.5 crashed with a raw ERR_UNKNOWN_FILE_EXTENSION stack trace, found on HAL-6398); words from HAL-6544

The `halonic` command shall check the Node.js it runs on before it loads any TypeScript. On a Node.js older than the version in the root `devEngines.runtime` (26.12), it shall print one line, "✕ Halonic needs Node.js 26.12 or later, but this is Node.js *version*. Install a newer one, for example with nvm install 26.", and exit with 1, without a stack trace. On 26.12 or newer it shall run as usual.

## Examples

- Given Node.js 18.19.1,
  when `halonic --version` runs,
  then it prints "✕ Halonic needs Node.js 26.12 or later, but this is Node.js 18.19.1. Install a newer one, for example with nvm install 26." and exits with 1.
- Given Node.js 26.11.0,
  when `halonic` runs,
  then it prints the same line for 26.11.0.
- Given Node.js 26.12.0 or 27.0.0,
  when `halonic` runs,
  then it runs the command.
