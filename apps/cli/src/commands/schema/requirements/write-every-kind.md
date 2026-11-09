# cli.commands.schema.write-every-kind

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old `studio schema [outDir]` at 784f78d; the success line from HAL-2196, in the words of the approved CLI output on HAL-1981 (sections 1.2 and 3.9); the system's separator and quoted names from HAL-2472

The `halonic schema [outDir]` command shall write the JSON Schema of every file kind to `<kind>.schema.json` in `outDir`, `schemas` by default, creating the folder when it is missing, with the same text as the `core/format` golden files, and shall print a ✓ line saying how many it wrote and where, with the folder as the user would type it from where they are (a folder below starts with `./`), with the system's path separator, so `.\` on Windows. When it refuses more than one folder, it shall show a name that is empty or holds a space or a comma in double quotes.

## Examples

- Given an empty folder,
  when `halonic schema out` runs in it,
  then `out/agent.schema.json` holds the agent kind's JSON Schema, every kind has its file, it prints "✓ Wrote 15 JSON Schemas to ./out." (".\out" on Windows), and it exits with 0.
- Given `halonic schema "" b`,
  when it runs,
  then it prints '✕ halonic schema takes at most one folder, and you gave two: "", b.' and exits with 2.
