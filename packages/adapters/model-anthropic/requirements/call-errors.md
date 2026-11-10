# model-anthropic.call-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `ModelCallError` reasons in the `LlmProvider` port v1

The Anthropic provider shall fail with `refused` on HTTP 401 or 403, `model-missing` on 404, `offline` when the API can't be reached, and `refused` on any other error, such as an overload, or a reply it can't read. The message shall keep the API's own error text, shortened, except after 401 or 403 and whenever that text holds something shaped like a key. Every failed call shall be closed.

## Examples

- Given the API answers 529 with "Overloaded",
  when `chat` fails,
  then the error says `refused` and its message ends in "HTTP 529: Overloaded".
- Given the API answers 403 with text that repeats the key,
  when `chat` fails,
  then the message holds none of the API's text.
