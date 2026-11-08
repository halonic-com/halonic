# parity.runner-traces-old-loader

- Status: active
- Since: 0.1.0
- Source: HAL-204

When the old runner runs on a composed workspace, it shall record what the old loader reported, and for each file whether the loader read it, which file kind's schema checked it, and that schema's issues with their key paths. Where the loader gave a line for an issue, the runner shall add it.

The runner shall map files in a grouped or legacy-grouped layout to the flat path the old loader uses, and record the exit code and output of the old `validate` command, run with the old repo's own `tsx`.

If the old code lacks a schema or loader export the runner needs, then the runner shall stop and name the export.

## Examples

- Given a file whose `port` key fails the schema on line 2, then its issue has path `["port"]` and line 2.
- Given a file the old loader never reads, then it is recorded as not read, with no schema.
- Given `grouped/workspace.yaml`, then its flat path is `workspace.yaml`.
- Given an old schema package without `Hub`, then the runner stops with `no export "Hub"`.
