# cloudflare-live.transfer

- Status: active
- Since: 0.1.0
- Source: HAL-6706 (HAL-198 step 3c); multi-cloud ADR 5.6 and 5.9; Worker side `runtime.admin-key`, `runtime.export-data`, `runtime.import-data`; client side `deploy.worker-transfer`

The live suite shall check a deployed Worker's health route, its admin routes and an export round trip over the network, and fail unless the Worker answers as the README's contract says. `/health` shall answer 200. While no admin key is set, `/admin/export`, with or without a key, shall answer exactly as an unknown path does. While a one-job key set by `withAdminKey` is in force, a request with no key, a wrong key, the key in the URL, or the right key together with an `Origin` header shall be refused (401 or any non-200 for the `Origin` case), and the right key shall import the example export of `@halonicjs/format`, twice, and export it again, every imported file coming back with the same SHA-256. The exported folder shall then read as a Node import reads it: the manifest passes the format's schema, every listed file has the manifest's size and SHA-256, run logs and record logs parse, a record log is named by the SHA-256 of its collection, a blob is named by its hash, and no file in the folder is unlisted. After the job the Worker shall answer `/admin/export` as closed again, so nothing is left behind. A failing check shall name the route or path and the status, never a key or file content.

Rationale: the unit tests of the deploy and runtime packages use fakes. Only a call over the network proves that the real Worker, its secrets and its storage keep the contract, and that the key's secret is really gone after the job. The Node host has no importer yet (the profile layout is not built), so the Node side of the round trip is the same reading it will do.

## Examples

- Given a Worker with no admin key and `/admin/export` answering 401, then the closed check fails and names the 401.
- Given a Worker that takes the key from `?key=`, then the bad-key check fails and names the 200, not the key.
- Given a Worker whose export returns a record log with other bytes than were imported, then the round trip fails and names the path.
- Given an export folder with a file the manifest doesn't list, then reading it as Node fails and names the file.
