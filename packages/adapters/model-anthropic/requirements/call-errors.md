# model-anthropic.call-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `ModelCallError` reasons in the `LlmProvider` port v1; `key-refused`, `out-of-credit` and `provider-busy` added on HAL-3008, from the provider fact sheet on HAL-3058

The Anthropic provider shall fail with `out-of-credit` on HTTP 402, on a `billing_error`, on a 429 whose `error.details.error_code` is `enforced_spend_limit_reached`, and on any error that says the credit balance is too low or the user's API usage limit is reached, `key-refused` on 401 and on a 403 whose text doesn't name a country, region, moderation or the model, `model-missing` on 404, `provider-busy` on any other 429, any 5xx and the 529 of an overload, `offline` when the API can't be reached, and `refused` on any other error or a reply it can't read. The message shall end in the HTTP status and hold none of the API's own error text, which Studio and the command line don't show (microcopy 1.4). The error's `cause` shall keep that text, shortened, except when the key is refused and whenever it holds something shaped like a key. Every failed call shall be closed.

## Examples

- Given the API answers 529 with "Overloaded",
  when `chat` fails,
  then the error says `provider-busy`, its message ends in "(HTTP 529)", and its cause holds "Overloaded".
- Given the API answers 403 with text that repeats the key,
  when `chat` fails,
  then neither its message nor its cause holds any of the API's text.
- Given the API answers 429 with `enforced_spend_limit_reached` in its details,
  when `chat` fails,
  then the error says `out-of-credit`, not `provider-busy`.
