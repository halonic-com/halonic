# format.tool-file

- Status: active
- Since: unreleased
- Source: HAL-17948 (plan HAL-17450 rev 5, "The plugin builder" and "Safety"); object and list parameters: HAL-18238

When `parseFile` reads a `library/tools/<id>.tool.yaml` at the workspace root, the format shall take its `id` from the file name when the file has none, require a `name` of lowercase words joined by `_` (at most 48 characters), a `description` of 1 to 500 characters, `callers` and an `action`, and fill in `version` (1) and `parameters` (`{}`). Each parameter shall be named by a lowercase letter followed by letters, digits or `_` (at most 40 characters), have a `type`, a `description` of 1 to 300 characters and `required` (default `false`). A flat `type` is `string`, `integer`, `number` or `boolean`: a string may have an `enum` of 1 to 50 choices and a `maxLength` up to 10,000 (default 1,000), and an integer or number a `minimum` and `maximum`. A parameter of `type: object` shall have `fields`, 1 to 16 flat parameters named and written the same way; a parameter of `type: list` shall have `items`, one flat value with the same keys but no `description` or `required`, and `maxItems` from 1 to 100 (default 20). Nothing nests deeper. `callers` shall be `everyone` or `{ agents: [...] }` with 1 to 100 names, and has no default. A tool shall have at most 16 parameters. The format shall fail any unknown key at any depth, and any control character, invisible format character, line or paragraph separator or text-direction mark in the description, a parameter's or field's description or a choice (a description may break lines).

## Examples

- Given a tool with an id, name, description, `callers: everyone` and an action, when it is parsed, then `version` is 1 and `parameters` is `{}`.
- Given a string parameter without `required` or `maxLength`, when it is parsed, then they are `false` and 1,000.
- Given a tool without `callers`, when it is parsed, then it fails at `callers`: no one is allowed by default.
- Given `script:` at the top, `default:` in a parameter or `host:` in an action's settings, when it is parsed, then it fails with `unrecognized_keys` there.
- Given an object parameter without `fields`, an object field of `type: object` or `type: list`, a list without `items`, a tool named `PR-Status`, a parameter named `Pr` or 17 parameters, when it is parsed, then it fails there.
- Given a `monitor` parameter of `type: object` with flat `fields` and a `blockedBy` parameter of `type: list` with string `items`, when it is parsed, then it passes and `maxItems` is 20.
- Given a description with a right-to-left override mark, when it is parsed, then it fails at `description`.
