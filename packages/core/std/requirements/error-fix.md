# std.error-fix

- Status: active
- Since: 0.1.0
- Source: HAL-1994, decided on HAL-1984: an error carries its fix as its own field, so the CLI's `validate` and `--json` can show it on its own line

The `KindedError` class shall carry an optional `fix`, the one next step as its own sentence, kept apart from its message. When none is given, it shall have no `fix`, so a surface shows no fix line and never makes one up.

## Examples

- Given `new KindedError("unavailable", "Halonic couldn't reach Ollama.", { fix: "Start Ollama, then run again." })`, when it is read, then its message is the first sentence and its `fix` is the second.
- Given a `KindedError` made without options, when it is read, then it has no `fix` and no `cause`.
