# Decision: the PR watcher reads GitHub through one GraphQL snapshot

- Approval: the board approved the supervision plugins plan on HAL-15997 (22 Nov), change 5: one GraphQL snapshot per pass instead of REST reads; the work is HAL-16003, and Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:INY14DF6gjtUb6Orgkl0C52SxgtjNioIyGHbWpeKODh5HRvc4ntcv3CYisCKv8aIesCSP5frDeHI+KkNLbL4Dw==

The PR watcher now reads GitHub once per pass, through the GraphQL snapshot
(`src/snapshot/`), instead of 4 REST requests per pull request. GraphQL
only answers POST requests, so `paperclip.pr-watcher-read-only` changes
from "only GET requests" to "only GET requests and GraphQL documents that
are a single query, only to `api.github.com`". The GraphQL reader refuses a
mutation or subscription before it sends anything
(`paperclip.github-snapshot`), so the token still changes nothing.

Two tests move with the reads:

- `watch.test.ts` checked that `tick` sent only GET requests. `tick` no
  longer reads GitHub itself; it gets the facts from the job. The job-level
  test in `src/plugin/job.test.ts` already ran a full pass and now checks
  every request is a GET to `api.github.com` or a POST to its `/graphql`.
- `discover.test.ts` checked that the closed list is read page by page only
  while every pull request on a page is recent. Discovery reads the
  snapshot now and sends no requests; the same paging rule is tested where
  it moved, in `src/snapshot/snapshot.test.ts` ("reads closed pull requests
  until one is older than the window").

## Covers

- paperclip.pr-watcher-read-only
- paperclip.pr-watcher-plugin
- tooling/paperclip/src/pr-watcher/watch.test.ts
- tooling/paperclip/src/pr-watcher/discover.test.ts
