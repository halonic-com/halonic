# Decision: narrower check hosts and only known reason codes

- Requirements: `google-sign-in.check-request` (`packages/host/google-sign-in/requirements/check-request.md`)
  and `google-setup.check-result` (`packages/core/google-setup/requirements/check-result.md`)
- Task: HAL-708 (build plan B3), the follow-ups the security reviewer listed in HAL-1226 and HAL-1277
- Approval: the maintainer approves this note in review

Both changes make the requirements stricter. Nothing that passed before and should still pass is
refused.

## What changes

1. **A `googleCheck` URL must be on one of the service's own APIs.** Before, any `googleapis.com`
   host could receive the access token. Now the host must be one of the service's `googleApis` hosts
   or `www.googleapis.com`, Google's shared host for older APIs (Drive's sheet checks
   `www.googleapis.com/drive/v3/about`). `googleapis.com` itself, Cloud Storage's hosts, where
   anyone can have a bucket, and other services' API hosts are refused. Both sheets in the
   integrations repo pass.
   - A listed host counts only when it has the form `<name>.googleapis.com` and isn't Cloud
     Storage's or the shared host, so a sheet that skipped the integrations sheet check can't send
     the token to `evil.example.com` or `googleapis.com` by listing it (HAL-1351).
   - On the shared host, the path's first segment must be one of those `<name>`s (`/drive/` for
     `drive.googleapis.com`), so a check can't reach Cloud Storage's JSON API at
     `www.googleapis.com/storage/v1/…` and read someone else's bucket as the user.
2. **A failed check keeps only a reason code we know.** Before, `checkFailed.reason` kept any single
   word of up to 64 characters, so a one-word secret that Google echoed would come back. Now only
   codes from Google's `ErrorInfo` list and its older JSON API reasons are kept
   (`google-reason.ts`). Any other reason is dropped, and the result has the status only.

## Tests

The test "allows googleapis.com itself, a subdomain and the default port written out" now allows
Gmail's path on `www.googleapis.com` instead of `googleapis.com`, which is refused. The refused
list gains `googleapis.com`, two Cloud Storage hosts, another service's host and four shared-host
paths that aren't Gmail's. A new test refuses a check on a listed host that isn't a service's own
Google API. A new test pins the 10-second
limit. The reason tests gain an unknown single word and an unknown reason before a known one. No
case was dropped.
