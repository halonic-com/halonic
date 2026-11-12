# Decision: model adapter errors use Studio's and the CLI's words, and keep the vendor's text off the message

- Approval: wording on board-approved texts, decided by the team under the board's HAL-2282 rule (Sofia's words check on HAL-2994); the package owner (Liam) approves this note in review
- Kind: user-visible
- Task: HAL-2972, HAL-3008

## What changes

`model-anthropic.call-errors` and `model-openai.call-errors` said the message keeps the provider's
own error text, shortened. Now the message ends in the HTTP status, such as "(HTTP 400)", and holds
none of that text. The text, shortened and checked for keys as before, goes on the error's `cause`
as a `VendorErrorText` with its status. The examples say the same. Which texts are dropped (after
401 or 403, a key shape, the call's own key) doesn't change, and neither do the reasons.

The messages themselves use the words of microcopy 15.3 and cli-output 3.4 (W1 to W8 of the words
check): "didn't accept the key", "doesn't have the model", "can't use tools, and this call offered
tools", "Halonic couldn't reach _id_ at _host_", "in a form Halonic can't read" and "was over
10 MB, more than Halonic reads".

## Why

For the reason `refused`, Studio and the CLI show the adapter's message as it is: "Halonic can't
tell the cause yet: _message_". Microcopy 1.4 (approved) allows no quoted outside text there, and
cli-output's checklist allows no raw provider text without `--debug`.

The run log's `run.failed` and `llm.fallback` record only the message, not `cause`, so the vendor's
text doesn't reach the run log yet. Where it should go is Liam's call, on the pull request.

No test was weakened: each case now pins the whole message and the text on `cause`, where before
it matched part of the message.

## Covers

- model-anthropic.call-errors
- model-openai.call-errors
- packages/adapters/model-anthropic/src/anthropic-provider.test.ts
- packages/adapters/model-openai/src/openai-provider.test.ts
