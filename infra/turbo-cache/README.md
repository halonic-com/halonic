# Turborepo remote cache (Cloudflare Worker + R2)

A small Worker that speaks Turborepo's remote-cache API (`/v8/artifacts`) and
stores artifacts in the R2 bucket `halonic-turbo-cache`. One team, bearer-token
auth, no database. Objects expire after 30 days (lifecycle rule on the bucket).

- **Fails closed.** If the `TURBO_TOKEN` binding is missing or `get()` fails,
  every request gets 401.
- **Two tokens.** `TURBO_TOKEN_READ` can read and query; `TURBO_TOKEN` can also
  upload (a read token's `PUT` gets 403). Both live in the Cloudflare Secrets
  Store. In GitHub, `TURBO_TOKEN_READ` is a repository secret (pull requests
  use it) and `TURBO_TOKEN` is a secret of the environment `turbo-cache-write`,
  limited to the branches `main` and `gh-readonly-queue/main/*`, so no pull
  request can read it. `TURBO_REMOTE_CACHE_SIGNATURE_KEY` is a repository
  secret; `TURBO_API` and `TURBO_TEAM` are repository variables.
- **Signed artifacts.** `turbo.json` sets `remoteCache.signature`, so a
  poisoned cache entry fails verification on download.
- **Who writes.** Only `main` and the merge queue hold the write token. Pull
  requests only read. Local runs don't use the remote cache at all.

Deploy: `wrangler deploy` in this folder (needs a Cloudflare token with
Workers edit rights). The deployed copy is also kept in sync by hand, so change
this folder in a pull request and deploy it afterwards.
