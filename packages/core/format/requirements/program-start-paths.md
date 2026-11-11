# format.program-start-paths

- Status: active
- Since: 0.1.0
- Source: HAL-4777, from Liam's review of HAL-4732

The format shall list the paths a program start names, besides the folder it starts in, the same way for every guard that refuses a start by what it names: the program; each argument and `env` value whole, split at `;` and spaces, and split at `=`, `:`, `;`, `@` and spaces; the whole text after each `=`, `:` and `@`; each of those pieces also without a short flag such as `-c`; and the folder path of a module that `python -m` runs. Each path keeps the program, argument or `NAME=value` it comes from, for messages.

## Examples

- Given `node --config=tools/mail.json`,
  when its paths are listed,
  then they include `node` and `tools/mail.json`, the latter shown as `--config=tools/mail.json`.
- Given `python -ctools/run.py -m tools.mail`,
  when its paths are listed,
  then they include `tools/run.py` and `tools/mail`.
- Given the `env` value `NODE_PATH=tools/lib:/usr/lib`,
  when its paths are listed,
  then they include `tools/lib`, shown as `NODE_PATH=tools/lib:/usr/lib`.
- Given a Windows path list in an `env` value, with a drive letter on each path,
  when its paths are listed,
  then each path keeps its drive letter.
- Given `npx @acme/mail-mcp`,
  when its paths are listed,
  then they include `@acme/mail-mcp` and `acme/mail-mcp`.
- Given `node --file=my link`,
  when its paths are listed,
  then they include `my link`, the whole text after the `=`.
