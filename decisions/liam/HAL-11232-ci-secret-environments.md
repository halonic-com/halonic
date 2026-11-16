# Decision: the leak terms and the release bot token live in protected environments

- Approval: HAL-11232, from the 0.1.1 release review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xp98oJ27NWt7Jw0uuV8OAOUz2F2I6U2DJ3gP6pt+I4Spi7ewmOCnRm05HT4RgUwe7XnYr2Mj5ArSJlVak9VqDA==

The personal-terms list and the release bot token move from repository
secrets into environments that only `main` (and, for the terms, the merge
queue) may use, as the Turbo signing key did. A pull request's own CI run
scans without the terms; a new `pull_request_target` workflow checks them
with the base branch's code and reads the pull request only as git objects.
The merge queue still checks the terms before anything merges.

## Covers

- .github/
