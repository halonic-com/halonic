# integration-kit.run-tool

- Status: active
- Since: 0.1.0
- Source: HAL-1216 (moves `ToolImplementation` and `runTool` from the integrations guide into the kit)

The kit's `runTool(tools, client, call, makeError)` shall find the tool named in the call, check its arguments with the tool's schema and run it with the parsed arguments and the call's signal, returning the tool's result as JSON. A tool's `run` shall be typed to give a value, never nothing, and a result of `undefined` shall still come back as the string `null`. It shall refuse an unknown tool with `makeError("not-found", …, "not_found")`, repeating at most 64 characters of the name, and invalid arguments with `makeError("bad-arguments", …, "invalid_input")`, naming the path of each bad field once, at most 64 characters of it, and never its value. Any schema with Zod's `safeParse` fits, so the kit needs no Zod.

## Examples

- Given a tool `test_echo` and the arguments `{ text: "ab" }`,
  when it is called,
  then the result is the tool's object as JSON.
- Given a tool whose `run` gives `undefined`,
  when it is called,
  then the result is the string `null`.
- Given a call to a tool name of 200 characters that no tool has,
  when it is called,
  then it fails with `not-found`, kind `not_found`, and the message repeats only the first 64 characters.
- Given arguments with a too-long `text`, a bad `times` and an unknown key,
  when it is called,
  then it fails with `bad-arguments`, kind `invalid_input`, the message names `text`, `times` and `(arguments)`, and it doesn't contain the text.
