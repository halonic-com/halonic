# Turborepo remote cache (Cloudflare Worker + R2)

A small Worker that speaks Turborepo's remote-cache API (`/v8/artifacts`) and
stores artifacts in the R2 bucket `halonic-turbo-cache`. One team, bearer-token
auth, no database. Objects expire after 30 days, and the merge queue's
objects (`q/`) after 7 days (lifecycle rules on the bucket, below).

- **Fails closed.** If a secret binding is missing or `get()` fails, the
  request gets 401.
- **Read token.** `TURBO_TOKEN_READ` can read and query, never upload. It
  lives only in the Cloudflare Secrets Store: CI doesn't use it, because pull
  requests build with the local cache. `TURBO_REMOTE_CACHE_SIGNATURE_KEY` is a
  secret of the GitHub environment `turbo-cache-write`, which only `main` and
  the merge queue can use (the queue needs it to sign and verify entries); `TURBO_API` and `TURBO_TEAM` are repository variables.
- **Write token, only by OIDC.** There is no static write token in GitHub. A
  job on `main` sends its GitHub OIDC token (audience `halonic-turbo-cache`) to
  `POST /auth/github`. The Worker checks the signature against GitHub's keys,
  the repository, and the claims `event_name == push` with
  `ref == refs/heads/main`. GitHub sets those claims; a workflow file can't
  change them, so a pushed branch named `gh-readonly-queue/main/x` gets 403.
  The answer is a write token that lasts 30 minutes, signed with
  `TURBO_SIGNING_KEY` (Cloudflare Secrets Store only).
- **Merge queue writes only to its own area (HAL-14149).** The queue runs the
  queued change's own code, so it must not write entries that `main` trusts.
  A `merge_group` OIDC token on `gh-readonly-queue/main/*` gets a 30-minute
  queue token (`q.` prefix, same signature). It uploads only to `q/<hash>`,
  and reads (and queries) `q/<hash>` first, then `<hash>`. So each queue
  entry reuses what the entries ahead of it built. Write and read tokens
  never see `q/`: a hash can't contain `/`, so no request names a `q/` key,
  and `main` stays exactly as it was. Uploads from groups that fail and never
  merge stay in `q/` until the 7-day rule deletes them. Older `r.` read
  tokens (no longer handed out) still read until they expire.
- **Signed artifacts.** `turbo.json` sets `remoteCache.signature`, so a
  poisoned cache entry fails verification on download.
- **Who writes.** Only a push to `main` can write the shared area. The merge
  queue writes only `q/`. Pull requests don't use the remote cache, and
  neither do local runs or any other workflow (release, publish): keep it that
  way, since only `ci.yml`'s `build` job is covered by the rules above.

Deploy: `wrangler deploy` in this folder (needs a Cloudflare token with
Workers edit rights). The deployed copy is also kept in sync by hand, so change
this folder in a pull request and deploy it afterwards.

The bucket's lifecycle rules are set by hand too. The `q/` rule goes on
before or with the Worker that hands out `q.` tokens:

```
wrangler r2 bucket lifecycle add halonic-turbo-cache expire-queue-7d q/ --expire-days 7
```
