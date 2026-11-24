# format.tool-refusals

- Status: active
- Since: unreleased
- Source: HAL-17948 (plan HAL-17450 rev 5, "Safety": the plugin never takes secrets from the workspace)

When a tool file passes its schema, the format shall still refuse it, with an error at the field's path and a message that never repeats the value:

- with `value-looks-like-key` when its description, a parameter's description or choice, a named caller or any text in `action.with` holds a key by the rules of `format.keys-in-values`;
- with `parameter-asks-for-key` when a parameter's name says it holds a credential by those rules' name test (such as `token`, `apiKey`, `githubToken`, `password` or `authorization`), because an agent would have to hold the key to pass it;
- with `parameter-range-empty` when an integer or number parameter's `minimum` is more than its `maximum`.

## Examples

- Given a description holding an Anthropic key, when it is parsed, then it fails with `value-looks-like-key` at `description`, and the message doesn't hold the key.
- Given a key in a parameter's description, as the second `enum` choice or as the second named caller, when it is parsed, then it fails at `parameters.<name>.description`, `parameters.<name>.enum[1]` or `callers.agents[1]`.
- Given a parameter named `token`, `apiKey`, `githubToken`, `password` or `authorization`, when it is parsed, then it fails with `parameter-asks-for-key` at that parameter.
- Given an integer parameter with `minimum: 10` and `maximum: 1`, when it is parsed, then it fails with `parameter-range-empty` at its `minimum`.
