# Decision: credit the bundled Inter fonts and register the kit's fonts entry point

- Approval: HAL-18694 (the board asked for Inter Variable on HAL-10, 25 Nov); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YzNsYDdeJMf7wc7wixo2uYP57AjyAqatCvnbYqBR0t3bcv+hi6VIVKaa1T1HBUKDMBGh1RnwYxK3lF5UsrrYDQ==

The Studio kit now ships the two variable fonts of the official Inter 4.1 release
(`packages/studio/kit/src/fonts/InterVariable.woff2` and `InterVariable-Italic.woff2`, SIL Open
Font License 1.1). This note covers the three data changes under `tooling/check/` that come with
them; no check code changes and nothing that was checked before is checked less:

- `tooling/check/licences.json`: both font files under `vendored`, so `pnpm check:sbom --notices`
  credits them in `THIRD-PARTY-NOTICES.txt`.
- `tooling/check/licence-texts/Inter-OFL-1.1.txt`: the release's `LICENSE.txt`, with Inter's own
  copyright line, which those two entries name as their `text`.
- `tooling/check/policy.json`: `./fonts` under `extraExports` for `@halonicjs/studio-kit`. The font
  faces are their own entry point, imported only by the desktop window's `studio.css`, because the
  phone's connect page imports the kit's theme and the two files would take it over its 800 KB
  limit (HAL-15159).

## Covers

- tooling/check/
- tooling/check/policy.json
