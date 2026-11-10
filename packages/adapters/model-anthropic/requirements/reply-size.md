# model-anthropic.reply-size

- Status: active
- Since: 0.1.0
- Source: HAL-2972, from the review of #839; the 10 MiB response limit of `integration-kit`

The Anthropic provider shall read at most 10 MiB of a reply. When a reply declares or reaches a larger size, it shall fail with `refused`, stop reading and close the call. Of an error reply, it shall read at most 64 KiB, and keep none of the API's text when the reply is larger.

## Examples

- Given the API answers with a body that never ends,
  when `chat` fails,
  then the error says `refused`, its message ends in "was over 10 MB, more than Halonic reads", and the call is closed.
