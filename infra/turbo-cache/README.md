# Turborepo remote cache (Cloudflare Worker + R2)

A small Worker that speaks Turborepo's remote-cache API (`/v8/artifacts`) and
stores artifacts in the R2 bucket `halonic-turbo-cache`. One team, bearer-token
auth, no database. Objects expire after 30 days (lifecycle rule on the bucket).

- **Fails closed.** If the `TURBO_TOKEN` binding is missing or `get()` fails,
  every request gets 401.
- **Secrets.** `TURBO_TOKEN` lives in the Cloudflare Secrets Store; in GitHub it
  is a repository secret next to `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.
  `TURBO_API` and `TURBO_TEAM` are repository variables, not secrets.
- **Signed artifacts.** `turbo.json` sets `remoteCache.signature`, so a
  poisoned cache entry fails verification on download.
- **Who writes.** Only `main` and the merge queue upload. Pull requests and
  local runs only read.

Deploy: `wrangler deploy` in this folder (needs a Cloudflare token with
Workers edit rights). The deployed copy is also kept in sync by hand, so change
this file in a pull request and deploy it afterwards.
