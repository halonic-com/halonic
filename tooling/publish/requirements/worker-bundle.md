# publish.worker-bundle

- Status: active
- Since: unreleased
- Source: HAL-8957; deploy engine plan (HAL-6704), ADR 5.8

The Worker shall build into one ES module script, with the SHA-256 of its UTF-8 bytes as lowercase hex reported as the bundle hash. The same sources shall give the same bytes and the same hash on every build, from any working folder, with no timestamp, no source map and no absolute path in the script. The script shall export the Worker as its default and the three Durable Object classes under their fixed names, and shall leave `cloudflare:workers` for workerd to provide. The build shall fail with an error that names each import it could not bundle, shall fail on any package in the bundle that is not our own code, Cloudflare's own code or a library marked `cloudRuntime` in `tooling/check/dependencies.json`, naming it, and shall fail when the gzip-compressed script is over 10,000,000 bytes, the Cloudflare Workers paid-plan limit.

Rationale: `deploy status` shows the bundle hash so a reviewer can tell that the deployed code is the code they reviewed, which only works when the same sources always give the same hash.

## Examples

- Given two builds of the same sources, one run from another folder, then the scripts are byte for byte the same and so are the hashes.
- Given a script, then its hash is the 64-character lowercase hex SHA-256 of its bytes.
- Given the built script, then it exports `worker as default`, `CoordinationObject`, `RoutinesObject` and `RunObject`, and imports `cloudflare:workers`.
- Given an entry file that imports a package that does not exist, then the build fails and the error names that package.
- Given an entry file that imports a package that is not on the runtime list, then the build fails and the error names that package; given the real Worker, then the check passes.
- Given the real Worker, then its compressed size is under the limit; given a lower limit it is over, then the build fails with a size error.
