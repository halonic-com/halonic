# Decision: the sweeper empties an hlt- bucket before it deletes it

- Approval: the task asks for this change (HAL-10089, follow-up to HAL-9962); Liam approves and signs this note in review
- Kind: internal

## What changes

- `deploy.destroy` gets one rule for the test sweeper: for a bucket whose name starts with `hlt-`, it lists and deletes the bucket's objects (paged) before it deletes the bucket. A name without the `hlt-` prefix is still refused, and `destroy` of a real deployment is unchanged.

## Why

A live run that is cancelled before its teardown leaves objects in its `hlt-...-w-defs` bucket. Cloudflare refuses to delete a non-empty bucket, so every sweep failed with `bucket-not-empty` and the bucket leaked for good. This blocks turning `LIVE_CLOUD_ENABLED` on.

## Tests

Unit tests cover a non-empty bucket (paged, objects deleted before the bucket) and a non-`hlt-` name that is still refused with nothing emptied. Nothing was run against Cloudflare yet: the first live sweep is the real check.

## Covers

- deploy.destroy
