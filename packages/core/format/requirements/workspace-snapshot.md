# format.workspace-snapshot

- Status: active
- Since: unreleased
- Source: HAL-17962; the phase 3 plugin plan, rev 5 (HAL-17450, "Where the definitions live" and "The plugin builder")

When `buildSnapshot` builds a snapshot from a workspace commit's tool files and the actions a runtime has, the format shall parse each file as a tool definition, refuse the whole build with every problem and its file when any file fails, any tool names an action the runtime doesn't have, or two tools share a name, and otherwise give `{ snapshot: 1, commit, tools }` with the tools sorted by name and without the files' `version`, and `snapshotJson` shall write it as canonical JSON with a final line break, so the same files in any order give the same bytes. When `readSnapshot` reads a snapshot's text, it shall refuse text that isn't JSON, fails the snapshot schema (an unknown field, a `snapshot` other than 1, a commit that isn't a full lowercase hex id), names an unknown action or a taken name, fails a tool file's own checks, or isn't written exactly as `snapshotJson` writes it.

## Examples

- Given a valid tool file and its action, when the snapshot is built, then it holds that tool with its defaults, under the commit.
- Given a tool whose action the runtime doesn't have, when the snapshot is built or read, then it is refused with `tool-action-unknown`.
- Given a tool file with a key in a field, when the snapshot is built, then it is refused with `value-looks-like-key`, naming the file.
- Given the same tool files in two orders, when each is built and written, then the two texts are byte for byte the same.
- Given a short commit id, when the snapshot is built, then it is refused at `commit`.
- Given a written snapshot, when it is read back, then it is the same snapshot; with an extra field, a changed key order or spaces, it is refused.
- Given `@halonicjs/format/snapshot`, when its imports are followed, then it loads neither the YAML parser nor the builder, so a runtime that only reads snapshots carries neither.
