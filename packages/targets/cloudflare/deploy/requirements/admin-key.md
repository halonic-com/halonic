# deploy.admin-key

- Status: active
- Since: 0.1.0
- Source: HAL-6706; build plan 3d (HAL-198); multi-cloud ADR 5.6

A job that talks to the Worker's `/admin/...` routes shall run inside `withAdminKey`. It shall make a key of 32 random bytes (base64url) for that one job, set the Workers secret `HALONIC_SECRET_ADMIN_KEY_HASH` to the key's SHA-256 in hex, never the key, run the job with the key, and remove the secret when the job ends, whether it succeeded or failed. The key shall exist only inside the job. When the secret can't be removed, it shall fail with `admin-key-left`, naming the secret and saying to remove it, whatever the job's result was; the message shall hold neither the key nor its hash.

Rationale: the export and import routes exist only while the secret is set, so a secret that stays after a job leaves the deployment's data open to anyone who saw the key.

## Examples

- Given a job that returns, then the secret was set before it ran and is gone after, and the job's value is returned.
- Given a job that throws, then the secret is removed and the job's error is thrown.
- Given the secret can't be removed, then `withAdminKey` fails with `admin-key-left` even when the job succeeded.
- Given the key and its hash, then neither is in any error message.
