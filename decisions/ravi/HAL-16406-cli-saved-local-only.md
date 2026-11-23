# Decision: register the ./saved-local-only entry point of the app package

- Approval: Liam approved the plan and the subpath export on HAL-16406; the change is built in HAL-16406
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wnLyVPz4vIWItrArQdlHTEEfiubvCt+PacDHEYSo5tqljS9Acka3D3/SPmkXmdpcMiG+wcAjqbIWcts8NYG9Dw==

`withSavedLocalOnly` moves from Studio to `@halonicjs/app`, so `halonic run`, `runs send`, `routines watch`
and `serve` count Local only as on once it's saved on, as Studio already does. The CLI and Studio import it
from the new `./saved-local-only` subpath. This note registers that subpath in `extraExports` of
`tooling/check/policy.json`, which is the only change to that file.

## Covers

- tooling/check/policy.json
