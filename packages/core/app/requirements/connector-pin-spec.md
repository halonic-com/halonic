# app.connector-pin-spec

- Status: active
- Since: 0.1.0
- Source: HAL-1132 (release check C93: connectors started with `npx` or `uvx` are pinned to an exact version)

The app shall read the package a package-runner connector names only as `name@1.2.3` for npm and `name==1.2.3` for PyPI, with one exact version as `app.connector-pin-version` defines it. It shall refuse, with a reason a person can read, a spec without a version, with a tag or a range, or one that points at a URL, a git source, a local path or an npm alias.

## Examples

- Given the npm spec `@acme/mail-mcp@2.3.1` or `@acme/mail-mcp@2.4.0-beta.1`, or the PyPI spec `mail-mcp==2.3.1` or `mail-mcp==1!2.0rc1.post1`,
  when it is read,
  then it is accepted with its name and version.
- Given the npm spec `@acme/mail-mcp` or the PyPI spec `mail-mcp`, with no version,
  when it is read,
  then it is refused because it names no version.
- Given the npm spec `@acme/mail-mcp@latest` or `@acme/mail-mcp@next`, or the PyPI spec `mail-mcp==latest`,
  when it is read,
  then it is refused because the version is a tag.
- Given the npm spec `@acme/mail-mcp@^2.3.1` or `@acme/mail-mcp@2.x`, or the PyPI spec `mail-mcp>=2`, `mail-mcp~=2.3`, `mail-mcp==2.*` or `mail-mcp==2.3.1,<3`,
  when it is read,
  then it is refused because the version is a range.
- Given the spec `https://example.com/mail-mcp.tgz`, `@acme/mail-mcp@https://example.com/mail-mcp.tgz` or `mail-mcp @ https://example.com/mail_mcp-2.3.1.whl`,
  when it is read,
  then it is refused because it is a URL.
- Given the spec `git+https://example.com/acme/mail-mcp.git`, `github:acme/mail-mcp`, `acme/mail-mcp` for npm, or `mail-mcp @ git+https://example.com/acme/mail-mcp`,
  when it is read,
  then it is refused because it is a git source.
- Given the npm spec `./mail-mcp`, `file:mail-mcp` or `mail@npm:@acme/mail-mcp@2.3.1`,
  when it is read,
  then it is refused because it is a local path or an alias for another package.
