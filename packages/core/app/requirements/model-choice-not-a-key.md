# app.model-choice-not-a-key

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 (Pick a model, the error table) and 10.2 R4, approved by the board on HAL-7993

When a key is pasted for a provider, the key check shall say it isn't a key, before any call, if it is empty, has a space or line break inside, is a web address, or doesn't start the way that provider's keys start, and shall give that start for "It usually starts with …". Spaces and line breaks around the key shall not count.

## Examples

- Given `https://console.anthropic.com/settings/keys` for Anthropic,
  then the problem is `url`, and the usual start is `sk-ant-`.
- Given an Anthropic key for OpenAI,
  then the problem is `wrong-start`, although it starts with OpenAI's `sk-`.
- Given an OpenAI key with a line break after it,
  then there is no problem.
