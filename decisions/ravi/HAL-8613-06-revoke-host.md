# Decision: a sign-in's revoke URL is on its token or sign-in host

- Approval: Liam asked for this rule in his review of halonic#4066 on HAL-8613, before plugin sign-ins load; Liam approves this note in review
- Kind: internal

## What changes

The sheet check refuses a `revokeUrl` whose host is neither the `tokenUrl`'s nor the `authorizeUrl`'s (`sign-in-revoke-host`). Hosts compare as `URL.host` gives them, so `auth.example.com:443` is `auth.example.com`; a `{ fromSetting }` URL counts as the host of its setting, so a revoke URL from a setting must read the same setting as the token or authorize URL. `format.integration-sign-ins` gains the rule and its examples.

Tests and examples that put the revoke URL on a third host move it:

- `format.integration-sign-ins` and `format.integration-approved-sign-ins`: the Example sign-in revokes on `auth.example.com`, so its client secret now goes to that one host. A new example keeps two hosts, with the sign-in and revoke URLs on `login.example.com`.
- `plugins.plugin-client-secrets`: Acme signs in and revokes on `login.example.com` and gets its token from `auth.example.com`, so the client secret still goes to two hosts.
- `sign-in.token-attacks` (T11, T17): the hostile update moves the authorize URL to `evil.example` along with the revoke URL, because the revoke URL alone on `evil.example` is now refused before the attack runs. What the tests check is unchanged: sign-out revokes at the approved URL and sends nothing to `evil.example`.

## Why

Sign-out sends the refresh token, and the client secret when there is one, to the revoke URL. The trust line names the sign-in and token hosts and the trust check's Addresses lists the sheet's `hosts`, but a fixed revoke host need be in neither. A public client with a revoke URL on a third host would send the refresh token there, and the person never saw that host. Refusing it in the format keeps the trust check's words true without a new line for the person to read, and every provider we know of revokes on its token or sign-in host. Sign-ins aren't released yet, so no sheet in use changes.

## Covers

- format.integration-sign-ins
- format.integration-approved-sign-ins
- plugins.plugin-client-secrets
- sign-in.token-attacks
- packages/core/format/src/kinds/integration/sign-ins.test.ts
- packages/core/format/src/kinds/integration/approved-sign-ins.test.ts
- packages/studio/features/plugins/src/sign-in/client-secret-hosts.test.ts
- packages/testing/sign-in/src/token-attacks.test.ts
