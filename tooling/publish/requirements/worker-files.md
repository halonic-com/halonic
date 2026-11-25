# publish.worker-files

- Status: active
- Since: unreleased
- Source: HAL-18016; Liam's decision A on HAL-16060 (the Worker ships with `@halonicjs/target-cloudflare-deploy`, built at release)

The publish tooling shall write the Worker (`publish.worker-bundle`) into a folder as `halonic-worker.js`, with `halonic-worker.json` beside it holding the script's hash, the compatibility date, the Durable Object bindings and their migrations, the last three read from the runtime's `wrangler.toml`. Two builds of the same sources shall write byte-for-byte the same two files. It shall refuse a `wrangler.toml` without a compatibility date as `YYYY-MM-DD` or without a Durable Object binding, a binding without its name or class, a migration without its tag or new SQLite classes, a binding or migration field it does not know (such as `renamed_classes`) and a value in those parts that is not a plain quoted string or a one-line list of them, rather than ship the Worker without it. `pnpm --filter @halonicjs/tooling-publish run build-worker` shall write the two files into `packages/targets/cloudflare/deploy/worker`, where the Cloudflare target looks for them in a clone.

Rationale: one Halonic version means one Worker, so the bundle hash in `deploy status` tells a reviewer what runs. The compatibility date and the migrations change what Cloudflare does with the script, so they ship with it and change only with a new version, never with a user's config.

## Examples

- Given two builds of the same sources into two folders, then both folders hold the same bytes, and the manifest's hash is the SHA-256 of `halonic-worker.js`.
- Given the runtime's `wrangler.toml`, then the manifest holds its compatibility date and its four Durable Object classes.
- Given a migration with `renamed_classes`, then the build fails and names the line and the field.
- Given a binding with `script_name`, then the build fails and names the field.
- Given `name = 'RUN'`, then the build fails and names the line.
- Given no `compatibility_date`, or no Durable Object binding, then the build fails and says which.
