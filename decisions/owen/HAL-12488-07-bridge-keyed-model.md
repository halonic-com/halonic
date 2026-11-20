# Decision: a keyed access's `models` also hold at the APIs' own hosts

- Approval: Paperclip task HAL-12488 (Liam's review of #3975); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L0aJMx2Yi4SmRXe0BBiQmZNj2JiOAQlogAnp7tb0stGnF+RFgztBXIHh9F+ojGTgmQFwzxzPV1RLji0MG5bqBA==

`harness-bridge.compatible-request` (new in #3957, not yet released) said that at the API's own host the access's `models` are ignored ("whatever its `models` say"). Its last sentence now points to the new `harness-bridge.keyed-model` instead: when a keyed access names `models`, the bridge refuses, before it reads the key, a request whose `model` isn't exactly one of them, that has Messages' `fallbacks`, or that has a tool calling a model of its own (one that names a `model`, or Responses' `image_generation`). This holds at Anthropic's and OpenAI's own hosts as well as at a compatible provider.

One test changes with it: `compatible-model.test.ts` checked that a call to Anthropic's own host with `models: []` still went through ("ignores the models"). It now gives the access the model it calls, and still checks that the compatible-provider rules don't apply there; the refusals at the own host are tested in `keyed-model.test.ts`.

Why: the program writes each request, so with the agent's key it could call a model the host never priced, which no cost limit or budget counts. Liam asked on #3975 to reuse #3966's `models` list for this rather than add a second field.

A keyed access to an own host without `models` still lets any model through, as before, until the CLI host (#3964) and Studio's host (HAL-13519) send the list for every keyed access; the requirement says so, and changes with its own note then. No host sends `models` yet, so no running agent is affected. Nothing refused before is allowed now.

## Covers

- harness-bridge.compatible-request
