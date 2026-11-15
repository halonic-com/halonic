# deploy.admin-key

- Status: active
- Since: 0.1.0
- Source: HAL-6706; build plan 3d (HAL-198); multi-cloud ADR 5.6

The `withAdminKey` function shall wrap any job that talks to the Worker's `/admin/...` routes. It shall hold the deploy lock from before it sets the secret until after it removes it, so no deploy or rollback runs meanwhile, and set nothing when the lock is taken. It shall make a key of 32 random bytes (base64url) for that one job, set the Workers secret `HALONIC_SECRET_ADMIN_KEY_HASH` to the key's SHA-256 in hex, never the key, run the job with the key, and remove the secret when the job ends, whether it succeeded, failed or was interrupted (Ctrl C), even when the job doesn't stop. It shall try the removal up to three times. The key shall exist only inside the job. When the secret still can't be removed, it shall fail with `admin-key-left`, naming the secret and saying to remove it, whatever the job's result was. The deployments Cloudflare makes when the secret is set and removed shall be marked so that `rollback` never switches to them. No error that leaves it shall hold the key or its hash, in its message, stack or cause chain.

Rationale: the export and import routes exist only while the secret is set, so a secret that stays after a job leaves the deployment's data open to anyone who saw the key.

## Examples

- Given a job that returns, then the secret was set before it ran and is gone after, and the job's value is returned.
- Given a job that throws, then the secret is removed and the job's error is thrown.
- Given the secret can't be removed, then `withAdminKey` fails with `admin-key-left` even when the job succeeded.
- Given the secret can't be removed on the first try but can on the second, then `withAdminKey` returns the job's value.
- Given the key and its hash, then neither is in the message, stack or cause of any error, including the job's own error and the `cause` of `admin-key-left`.
- Given another deploy holds the lock, then it fails with `deploy-locked` and sets no secret.
- Given Ctrl C during the job, then the secret is removed and the lock freed before it fails with `deploy-aborted`, even if the job never returns.
- Given setting and removing the secret each made a deployment, then `rollback` ignores both: it goes to the deployment before the code now live, never to one of them.
