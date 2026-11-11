# Decision: an inherited http(s) URL whose user name is a token has that user name removed from the stopped report

- Approval: Paperclip task HAL-4703 (Tomas's decision of 11 Nov 2026, from Liam's review of halonic#1503 on HAL-4699)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:b5M8CXHWoSsS8lCblCStXbBIZ6wb9MKAfjkz21htbeuQeN0W4WGPw40LPfYsJhUfg/QEe90pMbm7kkdu3Cq+BA==

`mcp.stdio-inherited-secrets` removed the password of an inherited value written as a URL, but not
a token written as the URL's user name with no password, such as a Sentry DSN
(`https://<key>@o1.ingest.sentry.io/1`) or a git remote `https://<token>@github.com/...`. If the
secret scrubber doesn't know the token's shape, a program could echo it into the stopped report.

HAL-4703 decides: the user name of an inherited `http` or `https` URL with no password is removed
too, when it is at least 16 characters long. The length keeps plain user names such as `acme` or
`x-access-token` readable, while the tokens these URLs carry (a Sentry key is 32 characters, a
GitHub token 40) are longer. Other schemes, such as `postgres://user@host`, are left alone,
because there the user name is a plain name, and git's `git@host:repo` isn't a URL at all.

The requirement's text gains that one clause and two examples; nothing in it is removed. No test is
removed or weakened: two tests are added.

## Covers

- mcp.stdio-inherited-secrets
