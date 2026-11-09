# cli.commands.schema.write-every-kind

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old `studio schema [outDir]` at 784f78d

The `halonic schema [outDir]` command shall write the JSON Schema of every file kind to `<kind>.schema.json` in `outDir`, `schemas` by default, creating the folder when it is missing, with the same text as the `core/format` golden files, and shall print how many it wrote and where.

## Examples

- Given an empty folder,
  when `halonic schema out` runs in it,
  then `out/agent.schema.json` holds the agent kind's JSON Schema, every kind has its file, it prints "Wrote 15 JSON Schemas to out.", and it exits with 0.
