# model-openai.reply-size

- Status: active
- Since: 0.1.0
- Source: HAL-2972, from the review of #839, which shares these gaps with #693; the 10 MiB response limit of `integration-kit`

The OpenAI-compatible provider shall read at most 10 MiB of a reply, whether it is one whole reply or a stream of events. When a reply declares or reaches a larger size, it shall fail with `refused`, stop reading and close the call. Of an error reply, it shall read at most 64 KiB, and keep none of the server's text when the reply is larger.

## Examples

- Given the server answers with a body that never ends,
  when `chat` fails,
  then the error says `refused`, its message ends in "was over 10 MB, more than Halonic reads", and the call is closed.
- Given the server answers a stream with a body that never ends and has no line break,
  when `stream` fails,
  then the error says `refused`, its message ends in "was over 10 MB, more than Halonic reads", and the call is closed.
