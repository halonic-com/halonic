# harness-bridge.host-fallback

- Status: active
- Since: unreleased
- Source: HAL-17001 (router PR 4a, decided on HAL-16992, Q3: within a run, fall back only to the same model and data class; plan approved by Liam on HAL-17213 with four conditions: the bridge checks the data terms of each hop again, at most 3 hops, "no answer" means no status and headers within the bridge's existing time limit, and every hop gets the same request but its `provider`)

When the agent's keyed access at `openrouter.ai` names `fallbacks`, each an `alias` and a `routing`, the Node bridge shall send a `POST /v1/messages` or `POST /v1/responses` call that OpenRouter can't serve on to the next host pin, with the same model, key, address and request, with only its `provider` changed to that hop's routing. It shall move on only before any byte of the reply has reached the program, and only when the reply's status is 429, 500, 502, 503, 504 or 529, when the host can't be reached, or when no status and headers arrive within the bridge's response time limit. A reply that has started is never cut off for another host, however slow it is.

It shall never move on for a 401, 402, 403 or any other status, nor when the program or the bridge stopped the call, so a refused key, an empty account or a budget that is reached ends the call as before (HAL-3178). The last hop's reply shall reach the program unchanged, whatever its status.

Once a call has moved on, the run's later calls to that provider shall start on the new hop. Each try shall be recorded as its own `llm.request` with its `alias` and `routing`, and the bridge shall record an `llm.fallback` between two tries, with `from` and `to` (the aliases), the `provider`, the `model`, the new `alias` and an `error` in Halonic's own words, never the provider's error body.

The bridge shall use only the hops whose routing keeps the data at least as safe as the access's own `routing` (`data_collection: deny` stays `deny`, `zdr: true` stays `true`, `allow_fallbacks: false` stays `false`), and at most the first 3 of them. A hop names no model, key or address of its own. An access at any other host, the program's own sign-in, and an access without `fallbacks` shall behave as before.

## Examples

- Given a keyed access at `https://openrouter.ai/api` with alias `fast`, a pin and one fallback `fast-backup`,
  when OpenRouter answers the first try with 503,
  then the bridge sends the same request with `fast-backup`'s pin as `provider`, the program gets that reply, and the log holds `llm.request` (`fast`), `llm.fallback` (`fast` to `fast-backup`), `llm.request` (`fast-backup`) and `llm.response`.
- Given the same access,
  when the first try's host can't be reached, or sends no status and headers within the bridge's response time limit,
  then the bridge moves on to `fast-backup` the same way.
- Given the same access,
  when OpenRouter answers 401, 402, 403 or 400,
  then the program gets that reply, and the bridge makes no second try and records no `llm.fallback`.
- Given the same access,
  when the first try's reply has started and then breaks off,
  then the bridge makes no second try.
- Given a call that moved on to `fast-backup`,
  when the program sends its next call,
  then it goes to `fast-backup`'s pin first.
- Given two fallbacks that both get 503,
  when the program sends a call,
  then the program gets the last hop's 503 unchanged.
- Given a first pin with `data_collection: deny` and a fallback with `data_collection: allow`,
  when the first try gets 503,
  then the bridge doesn't use that fallback, and the program gets the 503.
- Given four fallbacks,
  when every try gets 503,
  then the bridge makes four tries in all: the first pin and three fallbacks.
- Given a keyed access with fallbacks at any host other than `openrouter.ai`,
  when the provider answers 503,
  then the program gets the 503, and the bridge makes no second try.
- Given a budget that is reached by the first try,
  when the first try gets 503,
  then the recorder refuses the second try's `llm.request`, and no second call goes out.
