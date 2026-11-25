# format.tool-file

- Status: active
- Since: unreleased
- Source: HAL-17962; the phase 3 plugin plan, rev 5 (HAL-17450, "What moves into the workspace" and "The plugin builder")

When `parseFile` reads a tool definition, the format shall require a `name` of lowercase letters, digits and `_` starting with a letter (at most 48 characters), a one-line `description` of at most 300 characters with no character a person can't see (a control or format character, which takes in zero-width characters, the byte-order mark, text-direction marks and the tag characters U+E0000–E007F, or a line or paragraph separator), and an `action` named as dot-separated lowercase words; read `callers` as `everyone` (default `false`) and a list of agent `agents` ids (default empty), so a file that leaves `callers` out is a tool nobody may call; read `parameters`, at most 20, as a map from a parameter name (never one every object already has, such as `constructor` or `toString`) to its `type` (`string`, `integer`, `number` or `boolean`), `description`, `required` (default `false`) and, for a string only, at most 50 `choices`, each held to the description's rule for hidden characters; and fail any unknown key at any depth, `callers` with both `everyone: true` and agents, and any value anywhere in the file, or any parameter name, that looks like a key.

## Examples

- Given a tool with a name, description, action, callers and two parameters, when it is parsed, then it passes, and `required` and `version` get their defaults.
- Given a tool without `callers`, when it is parsed, then it passes with `everyone: false` and no agents: nobody may call it.
- Given an unknown key at the top, in `callers` or in a parameter, when it is parsed, then it fails with `unrecognized_keys` there.
- Given `name: PR-Status`, an `action` without a dot, or a parameter of type `object`, when it is parsed, then it fails there.
- Given a description with a line break or a right-to-left override (U+202E), when it is parsed, then it fails at `description`.
- Given a description with a zero-width space (U+200B), a tag character (U+E0041), a line separator (U+2028) or a byte-order mark (U+FEFF), or a choice with a tag character, when it is parsed, then it fails there.
- Given a parameter called `constructor`, `toString`, `valueOf` or `hasOwnProperty`, when it is parsed, then it fails at that parameter.
- Given a parameter whose name has a known key's shape, when it is parsed, then it fails with `value-looks-like-key`, and the message doesn't repeat it.
- Given `callers` with `everyone: true` and an agent, when it is parsed, then it fails with `tool-callers-both`.
- Given `choices` on an `integer` parameter, or 21 parameters, when it is parsed, then it fails there.
- Given a key pasted into the description or into a parameter's description, when it is parsed, then it fails with `value-looks-like-key` there, and the message doesn't repeat it.

## Deliberate limits

- Whether the `action` exists is checked when the snapshot is built or read (`format.workspace-snapshot`), against the actions the runtime has; the file alone can't know them.
- The kind has no place in the loader's layout yet; the plugin builder names the folder it reads tools from.
