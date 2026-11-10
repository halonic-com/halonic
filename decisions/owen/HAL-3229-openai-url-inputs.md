# Decision: the OpenAI route refuses an image or file that OpenAI would fetch from a URL

- Approval: [HAL-3229](/HAL/issues/HAL-3229), asked for by Liam as a follow-up to [HAL-3218](/HAL/issues/HAL-3218); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-3229

## What changes

`harness-bridge.openai` gains one rule. When a part in an `input` item's `content`, or in a tool
call's `output` given as a list (such as a `function_call_output`), is an `input_image` whose
`image_url` isn't a `data:` URL, or an `input_file` with a `file_url`, the bridge refuses the
request with the kind `denied`, names the part (for example `input[2].content[0]`), and doesn't
call OpenAI. Two examples are added: one refused, one passed on unchanged. Nothing else in the
requirement changes.

## Why

OpenAI fetches such a URL from its own side, where the sandbox's network fence can't see it.
Decision 7 and HAL-2076 say anything that reaches outside goes through Halonic's tools. This is
the same rule the Anthropic route already has for a block whose `source` is a URL. The bridge
refuses rather than dropping the part, so the model never answers a request that differs from the
one the program sent.

Only a `data:` URL is let through, rather than refusing only `http` and `https`: any other value
would also be fetched or rejected by OpenAI, and refusing it keeps a scheme OpenAI might add later
on the safe side. An image or file given by `file_id` refers to a file already uploaded to OpenAI
and is passed on.

No test was weakened or removed.

## Covers

- harness-bridge.openai
