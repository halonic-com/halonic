# Decision: the MCP stdio connector starts package runners, through the pinned launcher

- Approval: Paperclip task HAL-4094 (review of the pinned launcher stack, for HAL-230 and HAL-2544)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:J29nx1PhTxmJYQr4LTe7crU9dtOTXwxi7fN9NbRti3XBvHpd/FKYDqEAGN68/Wgdcpl/c6ruSz7x5M3Xe6nxDg==

`mcp.stdio-connector` said the connector refuses every package runner (`npx`, `uvx` …) "which
starts through the pinned launcher". That was a placeholder until the launcher existed, so nothing
unpinned could start in between (HAL-230, PR 1c). This pull request adds the launcher
(`mcp.pinned-launcher`), so the requirement now says: a connector with a `pin` starts through the
launcher, and a package runner without a `pin` starts as configured, like any program the person
trusted. That is what `contracts.connector-pin` asks for ("starts an unpinned package runner once
trusted, as configured, with no registry lookup") and what `app.package-runner-launch` already
allows. The trust prompt still marks such a program as not pinned (build plan item 10c).

`contracts.connector-pin` changes in two ways, from Liam's review on HAL-4094. It gains three
bypass cases that every stdio launcher, the memory fake too, must refuse: `npx -y other-pkg
@acme/mail-mcp` (a command word that isn't the pin), `npx -y @acme/mail-mcp -p @acme/mail-mcp` and
`uvx mail-mcp --from mail-mcp` (a package option after the command word). And a pinned PyPI launch
may name the package as `mail-mcp@2.3.1`, the form `uvx` documents for its command word, as well
as `mail-mcp==2.3.1`. The suite's check reads both as the same version, so no other version gets
through. No case was removed.

The test `refuses a package runner, which starts through the pinned launcher` becomes `starts a
package runner without a pin as configured, in its cwd, like any trusted program`, with more
`expect` calls than before. Nothing else in the requirement changes.

## Covers

- mcp.stdio-connector
- packages/adapters/mcp/src/stdio/stdio-connector.test.ts
- contracts.connector-pin
