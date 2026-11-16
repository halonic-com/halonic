# Decision: run the cloud bundle check on the Worker in every build

- Task: HAL-11264
- Approval: Liam decided on HAL-11264 that `buildWorkerBundle` runs the check on every build and fails closed. A team decision with no board card.
- Kind: internal

`buildWorkerBundle` builds the Cloudflare Worker with a metafile and runs the cloud bundle check on it. Any package outside our code, Cloudflare's code and the libraries marked `cloudRuntime` fails the build and is named. `tooling/check` gets a library export, `loadBundleRules`, that `check:bundle` and the Worker build both use. The Worker's bytes and hash don't change.

The requirement `publish.worker-bundle` says this now. No test was weakened or skipped.

## Covers

- publish.worker-bundle
- tooling/check/
