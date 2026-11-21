# Decision: deploy.upload says how long the self-test waits for the address

- Task: HAL-14023
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14023 (Liam's follow-up from the review of #4117, HAL-13837)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ImpoR/5PPr1ffwCkO+zGQw9Y+fvRZWQ46H2En5WeCwgFOIw0/IQqfQ7Et01bYi0zUzfkRpd7PCrZCA8Xqh6ZDQ==

## What changes

The requirement `deploy.upload` gets one clause and three examples for what the deploy's self-test
already does: it tries again while the address gives no answer or an HTTP error, up to 5 tries, or
16 when the deploy turned workers.dev on; it takes at most 2.5 minutes in all; and it reports a
`self-test-retry` progress event before each retry. The clause also writes down that a report
saying a check failed is not retried. The source line names HAL-13834 and HAL-13837.

Nothing else in the requirement changes. No code or test changes.

## Why

#4096 (HAL-13834) added the 16 tries and #4117 (HAL-13837) the 2.5-minute limit and the retry
event. Their tests run under `deploy.upload`, but the requirement didn't mention any of it, so the
behaviour they check wasn't recorded.

## Covers

- deploy.upload
