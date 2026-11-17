# Decision: the CLI's sandbox links open /security/sandbox/ directly

- Task: HAL-12071
- Approval: Liam decided this on HAL-12071, from Nina's docs walk on HAL-12063; a team decision with no board card (HAL-2282 rule)
- Kind: user-visible

## What changes

Every sandbox `More:` link the CLI prints now starts with `https://docs.halonic.dev/security/sandbox/`
instead of `https://docs.halonic.dev/sandbox`, from one constant, `sandboxDocs` in
`apps/cli/src/messages/sandbox.ts`. For example,
"More: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)" becomes
"More: https://docs.halonic.dev/security/sandbox/#bubblewrap (bubblewrap-missing)".
The anchors and each line's shape and exit code stay the same. The examples in the three
requirements below change the same way; their rule text doesn't.

Studio's sandbox links (the inbox's sandbox card and the run page's "sandbox not ready" banner)
change the same way, through `docsKey` in `packages/core/app/src/sandbox-start-words.ts`, which
now reads `security/sandbox/#bubblewrap` instead of `sandbox#bubblewrap`.

## Why

`/sandbox` answers with a 301 and then a 307 before it reaches `/security/sandbox/`. The page
has every anchor the CLI links (`bubblewrap`, `linux-tools`, `user-namespaces`, `wsl1`,
`wsl2-folder`, `other`, `container`, `windows-preview`), so linking it directly saves two
redirects and keeps the anchor if a redirect ever drops it.

## Covers

- cli.doctor-node
- cli.doctor-windows-drive
- cli.run-windows-node-in-wsl
