# model-anthropic.call-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `ModelCallError` reasons in the `LlmProvider` port v1

The Anthropic provider shall fail with `refused` on HTTP 401 or 403, `model-missing` on 404, `offline` when the API can't be reached, and `refused` on any other error, such as an overload, or a reply it can't read. The message shall end in the HTTP status and hold none of the API's own error text, which Studio and the command line don't show (microcopy 1.4). The error's `cause` shall keep that text, shortened, except after 401 or 403 and whenever it holds something shaped like a key. Every failed call shall be closed.

## Examples

- Given the API answers 529 with "Overloaded",
  when `chat` fails,
  then the error says `refused`, its message ends in "(HTTP 529)", and its cause holds "Overloaded".
- Given the API answers 403 with text that repeats the key,
  when `chat` fails,
  then neither its message nor its cause holds any of the API's text.
