# Decision: a provider that answers 501 or 505 isn't busy

- Requirement: `model-anthropic.call-errors` (`packages/adapters/model-anthropic/requirements/call-errors.md`), `model-openai.call-errors` (`packages/adapters/model-openai/requirements/call-errors.md`)
- Task: HAL-12608, from Nina's docs check on HAL-12594 (section 8, P14)
- Approval: Liam's review on HAL-12608 (https://github.com/halonic-com/halonic/pull/3686 carries it)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bGOMKWXCVeG3MwJhAXUPE5PH3mrSlvw1yxsl6AkNPdms8LizyCjbLZ+c6/uuteKswS/9wd44xvlCPQPi+vuMDQ==

## What changes

Both model adapters fail with `refused` instead of `provider-busy` when the provider answers HTTP
501 (Not Implemented) or 505 (HTTP Version Not Supported). The message names the API's host and
points at the provider's `baseUrl` in models.yaml, and the provider's own text stays on the
error's `cause` for the run log. Every other 5xx, 429, Groq's 498 and Anthropic's 529 stay
`provider-busy`. Both requirements and their examples say so.

## Why

A 501 or 505 means the server at that `baseUrl` doesn't speak this API, often because of a wrong
path. Waiting won't fix it, so "the provider was busy, try later" sent the user the wrong way.
`refused` is reused rather than adding a reason: `model-unreachable` says to check the internet
connection, and the server was reached. A new reason would change the public `ModelCallErrorReason`
and run failure lists and their Studio and CLI wording, which is more than this bug needs.

## Tests

No test was weakened. The adapters' error tables gain 501 and 505 cases that expect `refused` and
a message that points at the `baseUrl`, and a 503 case that stays `provider-busy`.

## Covers

- model-anthropic.call-errors
- model-openai.call-errors
