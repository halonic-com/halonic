# cli.commands.schema.replace-links

- Status: active
- Since: unreleased
- Source: HAL-16336

When `halonic schema [outDir]` writes a `<kind>.schema.json` where a symbolic link or a hard link already is, it shall replace the link with the file it writes, and shall leave the file the link led to as it was.

## Examples

- Given `schemas/agent.schema.json` is a symbolic link to `notes.txt`, when `halonic schema` runs, then `schemas/agent.schema.json` is a file that holds the agent kind's JSON Schema, and `notes.txt` is unchanged.
- Given `schemas/workflow.schema.json` is a hard link to `notes.txt`, when `halonic schema` runs, then `notes.txt` is unchanged.
