# runtime.admin-key

- Status: active
- Since: 0.1.0
- Source: HAL-9486 (part 9b of HAL-197); multi-cloud ADR on HAL-35, 5.6; threat-model row "Export and import"; decided on HAL-9480

The Worker shall answer routes under `/admin/` only when the Worker secret `admin-key-hash` (`HALONIC_SECRET_ADMIN_KEY_HASH`) is set. It holds the SHA-256 of the one-job admin key in hex, never the key. Without it, every `/admin/...` path shall go to `host/server` and answer the same neutral 404 as any unknown path: a normal deployment has no export surface.

With the secret set, a request shall reach an admin route only when its `Host` is one of `HALONIC_ALLOWED_HOSTS` and it carries no `Origin` header; any other request goes to `host/server`, which refuses it as it refuses every request. A request that does reach the routes shall carry `Authorization: Bearer <key>`. The Worker shall hash the given key and compare the hash with the stored one in constant time, whatever the length of the guess. A missing, malformed or wrong key shall answer 401 `unauthorized` with a fixed message, and the key shall never be in a URL, a log line or an answer.

Rationale: the key is made for one export or import job, set as a secret by `halonic deploy export` or `import`, and removed when the job ends. Holding only its hash means the secret that stays in the Worker while the job runs can't open a route if a workspace reads it.

## Examples

- Given no `admin-key-hash` secret, then `GET /admin/export` is the 404 body of `/health/`.
- Given the secret is set and the request has no `Authorization` header, then the answer is 401.
- Given the secret is the hash of `K` and the request sends `Bearer K` for a listed host, then the route answers.
- Given the same request with the preview address as `Host`, or with an `Origin` header, then it is refused as any request is, and never reaches a route.
- Given a key one character longer than the right one, then it is 401, as any wrong key is.
