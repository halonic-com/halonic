# runtime.limits-push

- Status: active
- Since: unreleased
- Source: selling layer S1-7 (HAL-13219), plan "Limits document", task HAL-17835; signed-request format of HAL-13534
- Known limits: S1 signs with a test key; Cloud's real key set is pinned when Cloud signs pushes (S2).

When a deployment has the usage binding, Cloud's pinned public key set and its product id, the Worker shall answer `POST /cloud/limits/<scope>`, where the scope is `u/<id>` or `o/<id>`, only for a request that `verifyRequest` accepts in the `cloud-to-deployment` direction with one of the set's `command` keys and the deployment's product, and whose signed end-user header, when there is one, names the same scope. It shall record the request's nonce in that scope's usage object, so the same request sent again inside the time window is refused, and nothing shall reach the object before the signature holds. It shall then hand the document to the scope's usage object, which keeps it unless it has that version or a newer one, and answer 200 `{"limits":"applied"}` or `{"limits":"stale"}`. Every refused signature, key, time, nonce or scope shall answer the same 401 `unauthorized`; a document that isn't a valid limits document shall answer 400 `bad_limits`; a body over 64 KiB shall answer 413 `too_large`; a path whose rest isn't a scope shall answer 404. A deployment with none of the three shall answer the path as any unknown path, and one with only some of them shall answer 503 without naming what is missing.

Rationale: a limits push sets what a customer may spend, so only Cloud may send one, for the scope it signed, once.

## Examples

- Given a push signed by Cloud's command key for `u/acme`,
  when it arrives at `/cloud/limits/u/acme`,
  then the scope's object keeps the document and the answer is `{"limits":"applied"}`.
- Given the same signed push,
  when it arrives at `/cloud/limits/o/acme`,
  then the answer is 401 and `o/acme`'s object is never reached.
- Given a push that was accepted,
  when the same request is sent again a minute later,
  then the answer is 401.
- Given a push signed with Cloud's session key,
  when it arrives,
  then the answer is 401.
