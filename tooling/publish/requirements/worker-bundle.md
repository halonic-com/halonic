# publish.worker-bundle

- Status: active
- Since: 0.1.0
- Source: HAL-8957; deploy engine plan (HAL-6704), ADR 5.8

The Worker shall build into one ES module script, with the SHA-256 of its UTF-8 bytes as lowercase hex reported as the bundle hash. The same sources shall give the same bytes and the same hash on every build, from any working folder, with no timestamp, no source map and no absolute path in the script. The script shall export the Worker as its default and the three Durable Object classes under their fixed names, and shall leave `cloudflare:workers` for workerd to provide.

Rationale: `deploy status` shows the bundle hash so a reviewer can tell that the deployed code is the code they reviewed, which only works when the same sources always give the same hash.

## Examples

- Given two builds of the same sources, one run from another folder, then the scripts are byte for byte the same and so are the hashes.
- Given a script, then its hash is the 64-character lowercase hex SHA-256 of its bytes.
- Given the built script, then it exports `worker as default`, `CoordinationObject`, `RoutinesObject` and `RunObject`, and imports `cloudflare:workers`.
