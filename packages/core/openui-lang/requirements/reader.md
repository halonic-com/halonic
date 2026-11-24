# openui-lang.reader

- Status: active
- Since: unreleased
- Source: HAL-17645

When a reply in OpenUI Lang 1.1 is read, whole or as a stream of chunks, the reader shall give the checked component tree of its display part, as the spec's conformance fixtures expect it; shall give a `not-supported` result that names the feature, and no tree, for a reply that uses `Query`, `Mutation`, `$state`, an expression, `@Run` or any other `@` function apart from `@ToAssistant`, `@OpenUrl` and `Action`; shall give `too-large` for a reply over `OPENUI_MAX_CHARS` characters, a list over its item limit or a tree over `OPENUI_MAX_NODES` values, and `too-deep` for nesting deeper than `OPENUI_MAX_NESTING`; and shall give, after the last chunk of a stream ends, the same result as reading the full text.

## Examples

- Given `root = Stack([t])` and `t = Text("Hi")`, when the reply is read, then the tree is a `Stack` holding a `Text` with the text `Hi`.
- Given `root = Stack([Text("a"), chart])` and `chart = Chart([1, 2])`, when the reply is read, then `chart` is left out with an `unknown-component` error and the `Stack` still draws.
- Given a reply with `$sel = "a"`, when the reply is read, then the result is `not-supported` with the feature `state`.
- Given a fixture's text split into two chunks at any character, when the stream ends, then the result equals reading the full text.
- Given a reply nested one level deeper than `OPENUI_MAX_NESTING`, when the reply is read, then the result is `too-deep`.
