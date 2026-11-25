# deploy.shipped-worker

- Status: active
- Since: unreleased
- Source: HAL-18016; Liam's decision A on HAL-16060 (the Worker ships with this package, built at release)

When `deploy` is given no Worker loader, the Cloudflare target shall upload the Worker this package ships: `halonic-worker.js` in its `worker` folder, with the hash, compatibility date, Durable Object bindings and migrations from `halonic-worker.json` beside it (`publish.worker-files`). It shall pass on the manifest's hash, never one it works out from the script, so the upload refuses a script whose bytes don't match it (`bundle-hash-mismatch`) and nothing is uploaded. When either file is missing it shall reject with `unexpected` (`internal`), say "This Halonic has no Cloudflare Worker to upload yet." and say how to build it in a clone. It shall refuse a manifest without a 64-character hex hash, a compatibility date, at least one Durable Object binding with its name and class, or a tag on each migration. The shipped package shall never build the Worker: tests and the live suite give their own loader.

Rationale: everyone on one Halonic version uploads the same reviewed bytes, and a script changed after the release is refused instead of deployed.

## Examples

- Given both files, when the Worker is loaded, then it is the script with the manifest's hash, date and Durable Objects.
- Given a script that was changed after the build, when `deploy` runs, then it rejects saying the script doesn't match the hash, and no Worker is uploaded.
- Given no `halonic-worker.js`, when the Worker is loaded, then it rejects with `unexpected`, "This Halonic has no Cloudflare Worker to upload yet." and the `build-worker` command as the fix.
- Given a manifest whose hash is `abc`, or with no Durable Object binding, when the Worker is loaded, then it is refused.
