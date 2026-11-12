# format.deployments-cloudflare

- Status: active
- Since: 0.1.0
- Source: HAL-6699 (HAL-198 build plan, step 1a; multi-cloud ADR on HAL-35, 5.7)

When `parseFile` reads a `deployments.yaml`, the format shall accept on each deployment an optional `cloudflare` block with a required `worker` and an optional `domain` and `location`, and an optional `limits` block with an optional `dailyRequests`, and shall refuse any other key in either block. `worker` shall be 1 to 63 lowercase letters, digits or `-`, not starting or ending with `-`; `domain` shall be a lowercase host name with at least two labels and no scheme, port or path; `location` shall be `eu`; `dailyRequests` shall be a whole number above zero. When a deployment has a `cloudflare` block and a `host` other than `cloudflare`, the format shall warn with `cloudflare-settings-unused` at that block, without failing the file.

Rationale: these are the non-secret settings `halonic deploy` needs (ADR 5.6), so the file never holds an account id, token or key and stays safe to commit. `worker` becomes the first label of `<worker>.<account>.workers.dev`, which caps it at 63 characters. `location` is there from the start because Cloudflare fixes where D1, R2 and Durable Objects keep data when they are created, which matters for GDPR; `eu` is the jurisdiction all three support, and further values are added when a target needs them. `limits.dailyRequests` is a ceiling the handler enforces, because Cloudflare has no hard spending cap. Moving a deployment to another host changes only `host:` (ADR 2), so settings left behind only warn.

## Examples

- Given a deployment with `host: cloudflare` and `cloudflare: { worker: acme-halonic, domain: halonic.example.com, location: eu }` and `limits: { dailyRequests: 50000 }`, when it is parsed, then both blocks come back as written, with no warnings.
- Given a deployment with neither block, when it is parsed, then it has neither key, as before.
- Given `cloudflare: { domain: halonic.example.com }`, when it is parsed, then it fails at `deployments.<id>.cloudflare.worker`.
- Given `worker: Acme`, `-acme`, `acme-` or `acme_halonic`, when it is parsed, then it fails at `worker` with a message that says to use lowercase letters, digits or `-`, not at the start or end.
- Given a `worker` of 63 characters, when it is parsed, then it is accepted; of 64, it fails at `worker` with a message that says to use at most 63 characters.
- Given `domain: https://halonic.example.com`, `Halonic.example.com`, `localhost` or `halonic.example.com/app`, when it is parsed, then it fails at `domain` with a message that names a lowercase host name.
- Given `location: us` or `location: EU`, when it is parsed, then it fails with `invalid_value` at `location`.
- Given `cloudflare: { worker: acme, accountId: abc }` or `limits: { monthlyRequests: 5 }`, when it is parsed, then it fails with `unrecognized_keys` at that block.
- Given `dailyRequests: 0`, `-1` or `1.5`, when it is parsed, then it fails at `dailyRequests`.
- Given `host: local` with a `cloudflare` block, when it is parsed, then it passes with one warning `cloudflare-settings-unused` at `deployments.<id>.cloudflare`: `Deployment "<id>" runs on host "local", so its cloudflare settings are not used`.
- Given `host: local` with only a `limits` block, when it is parsed, then it passes with no warnings: the ceiling applies on every host.
