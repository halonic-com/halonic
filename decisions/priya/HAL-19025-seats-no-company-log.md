# Decision: the seats jobs log once per worker when no company lists seats

- Approval: scope set on HAL-19025; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1JT7YTN9eAyTbwSyGRWmBVmfY91HVdtSbbCc+UgeDdY7kRb9oXQWWIuCYgGjC7/9DRJqjtB+vGF+8AqBN/O/Dw==

## What changes

`paperclip.seats-read-store` gets one example: with no company whose settings list seats,
`seats.read` logs once that there is nothing to read, and stays quiet on later ticks. The log has
a company count only, no folder or account. No example was removed or weakened. `seatsOwner`
holds the check, so every seats job that calls it logs the same line once per worker.

## Why

The jobs returned silently on an empty seat list. The plugin ran for a day like that and three
Grafana deploys found no rows before anyone knew why (HAL-16027, HAL-18858).

## Covers

- paperclip.seats-read-store
