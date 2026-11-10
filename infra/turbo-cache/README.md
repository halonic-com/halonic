# Turborepo remote cache (Cloudflare Worker + R2)

A small Worker that speaks Turborepo's remote-cache API (`/v8/artifacts`) and
stores artifacts in the R2 bucket `halonic-turbo-cache`. One team, bearer-token
auth, no database. Objects expire after 30 days (lifecycle rule on the bucket).

- **Fails closed.** If a secret binding is missing or `get()` fails, the
  request gets 401.
- **Read token.** `TURBO_TOKEN_READ` can read and query, never upload. It is a
  repository secret in GitHub (pull requests use it). `TURBO_REMOTE_CACHE_SIGNATURE_KEY`
  is a repository secret; `TURBO_API` and `TURBO_TEAM` are repository variables.
- **Write token, only by OIDC.** There is no static write token in GitHub. A
  job on `main` or in the merge queue sends its GitHub OIDC token (audience
  `halonic-turbo-cache`) to `POST /auth/github`. The Worker
  checks the signature against GitHub's keys, the repository, and the claims
  `event_name == merge_group`, or `event_name == push` with `ref == refs/heads/main`.
  GitHub sets those claims; a workflow file can't change them, so a pushed
  branch named `gh-readonly-queue/main/x` gets 403. The answer is a write
  token that lasts 30 minutes, signed with `TURBO_SIGNING_KEY` (Cloudflare
  Secrets Store only).
- **Signed artifacts.** `turbo.json` sets `remoteCache.signature`, so a
  poisoned cache entry fails verification on download.
- **Who writes.** Only `main` and the merge queue can get a write token. Pull
  requests only read. Local runs don't use the remote cache at all.

Deploy: `wrangler deploy` in this folder (needs a Cloudflare token with
Workers edit rights). The deployed copy is also kept in sync by hand, so change
this folder in a pull request and deploy it afterwards.
