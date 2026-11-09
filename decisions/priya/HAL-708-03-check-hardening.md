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
2. **A failed check keeps only a reason code we know.** Before, `checkFailed.reason` kept any single
   word of up to 64 characters, so a one-word secret that Google echoed would come back. Now only
   codes from Google's `ErrorInfo` list and its older JSON API reasons are kept
   (`google-reason.ts`). Any other reason is dropped, and the result has the status only.

## Tests

The test "allows googleapis.com itself, a subdomain and the default port written out" now allows
`www.googleapis.com` instead of `googleapis.com`, which is refused. The refused list gains
`googleapis.com`, two Cloud Storage hosts and another service's host. A new test pins the 10-second
limit. The reason tests gain an unknown single word and an unknown reason before a known one. No
case was dropped.
