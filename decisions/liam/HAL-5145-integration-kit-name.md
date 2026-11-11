# Decision: a package staged for npm has its npm name in the workspace

- Approval: the board asked for one name for the kit on [HAL-45](/HAL/issues/HAL-45) (11 Nov) and Liam planned it on [HAL-5145](/HAL/issues/HAL-5145); a second agent reviews the pull request, then Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0+fxdgM1qAPafILXts49S3AUSEjyhDFzFN6IjF9qPFzJBDTkH/DeI9pYENUrII7yznKhIMv3WUI03a9hiO6NAQ==
- Task: HAL-5145

## What changes

The integration kit was `@halonicjs/adapter-integration-kit` in the workspace and
`@halonicjs/integration-kit` on npm. It is now `@halonicjs/integration-kit` in both places.

`packages` in `tooling/check` derived every adapter's name from its folder, which is where
`adapter-integration-kit` came from. It now names a package with `halonic.publish` after
`halonic.publish.name` instead, requires that name to be in the `@halonicjs` scope and fails when
the workspace name differs. Only packages listed under `published` in `policy.json` may have
`halonic.publish`, so the exception stays as narrow as that list. `policy.json` lists the kit under
its new name.

`integration-kit.integration-entry` names the entry `@halonicjs/integration-kit/integration`
instead of `@halonicjs/adapter-integration-kit/integration`. What it requires is unchanged.

`publish-kit.yml` builds the kit with `--filter=@halonicjs/integration-kit`. Its path filters,
the version comparison and the tarball names are unchanged, and no `version` field changes, so
merging publishes nothing.

## Why

Two names for one package confused readers (the board asked about it before 0.1.0), and the
suite's alias mapped one onto the other. The published name is the one integration authors see,
so the workspace takes that one.

## Covers

- integration-kit.integration-entry
- .github/
- tooling/check/
