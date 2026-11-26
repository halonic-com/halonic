# runtime.run-container-image

- Status: active
- Since: unreleased
- Source: HAL-18021; deployed check HAL-18578

The run container's image shall make every program it runs, including the ones the Worker starts with `exec`, run as the non-root user `halonic` and trust the Containers CA. The CA shall be named in the image's own environment (`NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`), not set up by the entrypoint, because `exec` starts a program without the entrypoint.

Rationale: the deployed check (runs 45807991122 and 45808347175) reached the allowed site through the intercepting proxy and Node refused its certificate, because the entrypoint's setup never reached the programs `exec` started. Every request leaves the container through that proxy, so its CA is the only one the programs need.

## Examples

- Given the image, when the Worker runs `node` with `exec`, then it runs as `halonic` with `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE` naming the Containers CA.
- Given a Dockerfile whose last `USER` is root, or that has no `USER`, then the image test fails.
