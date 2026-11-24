# Decision: five new entry points in core `app`, `format` and `workspace`, listed in `extraExports`

- Task: HAL-17615 (PR 1 of the plan on HAL-16764, which Liam wrote and Julian read)
- Approval: Liam approves the plan on HAL-16764 and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DKo1hrfFclTDQ3KPD0eMNC47s8VRq7SvB2NAtI8A9pTFZz7P9FAkg+dYVVZ21t+k7AI5Z7+0NOHPhPw4XoUkAA==

## What changes

`tooling/check/policy.json` lists five new entry points in `extraExports`, so the engine (PR 2)
can import what it needs without the package roots, and the Worker stops parsing `yaml` and
`@halonicjs/workspace` through the engine:

- `@halonicjs/app`: `./connector-factories`, `./model-text`, `./spend`
- `@halonicjs/format`: `./agent`
- `@halonicjs/workspace`: `./trust-url`

Each one only re-exports names the package root already exports, and an entry test checks that
it reaches no `yaml`, no package root and no `workspace` past `./trust-url`, and that each value
name is the root's own. `workspace/trust-url` doesn't change what a run may do: it's the same pure
function, which imports only `@halonicjs/std`.

## Covers

- tooling/check/policy.json
