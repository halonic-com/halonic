# cli.commands.validate.harness-model

- Status: active
- Since: unreleased
- Source: HAL-18930, from the T6 gap list on HAL-17270 (gap 5): only `halonic doctor` used the harness model check; the sentences are flow 5.6 and UX 2.5's, the rest decided by the team under the HAL-2282 rule

When `halonic validate` checks a workspace with an agent whose `harness` is a program (`claude-code`, `codex` or `opencode`) and whose `model` is an alias of its hub, it shall ask the same check as `halonic run` (`cli.harness-model-access`) whether the program can call the alias's provider. When it can't (Claude Code and OpenCode call only a provider of type `anthropic`, Codex only one of type `openai` or `openai-compatible`), it shall list an error on the agent's file with the code `harness-model-refused` that names the agent and the model: "Agent coder names model gpt. Claude Code can use Anthropic models only. Choose another." for Claude Code, "… This model can't be used with Codex. Choose another." for Codex, and "… OpenCode can use Anthropic models only. Choose another." for OpenCode. The error fails the check, so it shall exit 1. A Codex agent whose alias has a provider of type `openai-compatible` passes: `run` calls it, and whether that endpoint supports the Responses API is the Model page's line (`agents.configuration.harness-model`), not a problem `validate` lists, so `--strict` passes it too. A model name that is no alias of the hub, or one with a `/`, goes to the program as written and shall get no error, nor shall an agent that runs in Halonic's own loop.

## Examples

- Given a Claude Code agent `coder` whose model `gpt` is an alias on a provider of type `openai`,
  when `halonic validate --dir <workspace>` is run,
  then it lists the error `harness-model-refused` on the agent's file, saying "Agent coder names model gpt. Claude Code can use Anthropic models only. Choose another.", and exits 1.
- Given a Codex agent `coder` whose model `sonnet` is an alias on a provider of type `anthropic`,
  when `halonic validate --json` is run,
  then its problems hold one `harness-model-refused` error saying "Agent coder names model sonnet. This model can't be used with Codex. Choose another."
- Given an OpenCode agent `coder` whose model `gpt` is an alias on a provider of type `openai`,
  when `halonic validate --json` is run,
  then its problems hold one `harness-model-refused` error saying "Agent coder names model gpt. OpenCode can use Anthropic models only. Choose another."
- Given a Codex agent whose alias's provider has type `openai-compatible`,
  when `halonic validate --strict` is run,
  then it lists no problem about the endpoint and exits 0.
- Given a Claude Code agent whose alias's provider has type `anthropic`, or an agent without a harness on any alias,
  when `halonic validate` is run,
  then it lists no `harness-model-refused` error.
