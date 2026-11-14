# runtime.self-test

- Status: active
- Since: 0.1.0
- Source: HAL-6704 (deploy engine PR 5), plan [HAL-6704](/HAL/issues/HAL-6704#document-plan); free-plan decision HAL-6804

The Worker's `fetch()` shall answer `POST /self-test` only when `env.HALONIC_SELFTEST_TOKEN` is set to a non-empty string and the request carries `Authorization: Bearer <that value>`, compared in constant time. Without the variable the path shall answer 404 as any unknown path does; with the variable and a missing or wrong token it shall answer 401 with a code and a short message. A `GET` on the path shall answer 405 with `Allow: POST`.

An authorized call shall run these checks and answer 200 with `{"ok": <boolean>, "checks": [{"name": <string>, "ok": <boolean>}]}`, with `ok` true only when every check passed:

- `configuration`: every binding and secret the Worker needs is present.
- `database`: D1 answers `SELECT 1`.
- `blobs`: R2 answers a read of a key that does not exist.
- `sign-in`: the password hasher makes one hash and verifies it five times in a row, so a plan whose CPU limit is too low fails here and not on the first sign-in.

The answer shall carry only the check names and booleans: no error message, no value of a secret or of the token, no name of anything bound to the Worker.

Rationale: `halonic deploy` runs these checks against a version that is not live and switches traffic only if they pass. The route must be useless to anyone but the deployer, who sets the token for that upload.

## Examples

- Given no `HALONIC_SELFTEST_TOKEN`, then `POST /self-test` is 404.
- Given the token is set and the call carries another one, then the answer is 401.
- Given the token matches and D1 throws, then the answer is 200, `ok` is false and the `database` check is false.
