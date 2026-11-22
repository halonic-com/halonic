# deploy.admin-key-newest-version

- Status: active
- Since: unreleased
- Source: HAL-16340

When Cloudflare refuses to set the admin key's secret because the Worker's newest version isn't the one serving all its traffic (error code 10215: after a failed self-test left a version uploaded but not deployed, after a rollback, or during a split deployment), `withAdminKey` shall fail with `newest-version-not-deployed`, saying that nothing was changed and to deploy again first. It shall not run the job and shall not try to remove the secret. Any other failure to set the secret keeps the rules of `deploy.admin-key`.

Rationale: a Workers secret change makes a new version from the newest one and deploys it, so Cloudflare refuses it while that version isn't live, and it would refuse the removal the same way. Without this, the removal failed three times and the job ended with `admin-key-left`, which says the `/admin` routes are open when no secret was ever set.

Not verified against a live Cloudflare account: the code is the one Wrangler's `secret put` handles for this case. Removing a secret is assumed to be refused the same way, so it isn't tried.

## Examples

- Given a Worker that was rolled back, when `withAdminKey` runs, then it fails with `newest-version-not-deployed`, the job doesn't run and no removal is sent.
- Given a version uploaded and never deployed, then the same.
- Given Cloudflare answers a secret change with error code 10215, then the client fails with `newest-version-not-deployed`; any other refusal stays `cloudflare-request-failed`.
