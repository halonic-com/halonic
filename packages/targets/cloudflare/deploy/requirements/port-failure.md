# deploy.port-failure

- Status: active
- Since: unreleased
- Source: HAL-6702; build plan PR 05 (HAL-6702); multi-cloud ADR 5.6

The Cloudflare target shall reject every port method with the port's failure: each of its own error codes shall map to one of the port's codes and the kit's error kinds, so the command line's exit code comes from the kind (`ports.deploy-target`). Another deploy running and a lock lost to another deploy shall both be `deploy-locked` (`conflict`); a missing or refused token `unauthenticated`; a request Cloudflare didn't answer `unavailable`; two versions sharing traffic `traffic-split` (`conflict`); a fault in the target itself, or an error that isn't the target's own, `unexpected` (`internal`). An error that isn't the target's own shall not show its message, because it may quote a host response. The lock's holder shall be shown as the port's holder, with who started the deploy and when, and when the lock runs out, as ISO times.

Rationale: the command line branches on the port's kinds and codes only; a code it doesn't know would give the wrong exit code, and a host response could carry a secret.

## Examples

- Given the target's `deploy-locked` error naming sam@example.com, then the failure is `deploy-locked`, kind `conflict`, and the holder says sam@example.com with its start and end as ISO times.
- Given `token-inactive`, then the failure is `token-inactive`, kind `unauthenticated`.
- Given `traffic-split-in-progress`, then the failure is `traffic-split`, kind `conflict`.
- Given a `TypeError` whose message quotes a host response, then the failure is `unexpected`, kind `internal`, and its message doesn't quote it.
