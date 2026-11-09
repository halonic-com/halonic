# app.connector-pin-version

- Status: active
- Since: 0.1.0
- Source: HAL-1132 (release check C93: connectors started with `npx` or `uvx` are pinned to an exact version), the version part of `ports.connector-trust-enforcement`

The app shall accept a `ConnectorPin` only with one exact version: a semver version with an optional prerelease for npm, and a PEP 440 version in its normal form for PyPI. It shall refuse a pin whose version is a tag such as `latest` or a range, with a reason a person can read that says which it is. It shall refuse a resolved package whose name or version is other than the pin's, even a newer version.

The stdio launcher calls these checks before it starts a program. It doesn't exist yet, so `ports.connector-trust-enforcement` stays draft.

## Examples

- Given an npm pin at `2.3.1` or `2.4.0-beta.1`, or a PyPI pin at `2.3.1` or `1!2.0rc1.post1`,
  when it is checked,
  then it is accepted.
- Given a pin whose `version` is `latest` or `next`,
  when it is checked,
  then it is refused because the version is a tag.
- Given a pin whose `version` is `^2.3.1`, `~2.3`, `>=2`, `2.x`, `*`, `2.3` or `2.*`,
  when it is checked,
  then it is refused because the version is a range.
- Given a pin whose `version` is `v2.3.1`, `2.3.1+build.5` or, for PyPI, `2.3.1RC1`,
  when it is checked,
  then it is refused because the version isn't written as the registry lists it.
- Given a pin for `@acme/mail-mcp` at `2.3.1`,
  when the registry resolved `@acme/mail-mcp` at `2.3.2`, `2.3.0` or `2.3.1-beta.1`, or another package at `2.3.1`,
  then the resolved version is refused, and `@acme/mail-mcp` at `2.3.1` is accepted.
- Given a PyPI pin for `mail-mcp` at `2.3.1`,
  when the registry resolved `Mail_MCP` at `2.3.1`,
  then it is accepted, because PyPI treats both names as one package.
