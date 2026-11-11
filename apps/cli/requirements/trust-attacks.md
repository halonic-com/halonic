# cli.trust-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-3070 (follow-up to HAL-1551); the attack cases and harmless rewrites of `contracts.trust-fingerprint`; `contracts.trust-service-attacks`; `cli.not-trusted`; `cli.source-listing`

When a person has trusted a workspace and an attacker then makes any of the edits of `contracts.trust-fingerprint` to its connector files, the CLI shall start none of its connectors' programs and reach none of their servers when it reads a source's tool listing, shall write no run to the workspace's run log, and `halonic run` shall exit with 3 with the full fingerprint as the last stdout line. When a harmless rewrite of `contracts.trust-fingerprint` is made instead, the same commands shall still start the connectors and run the workflow, so a check that refuses everything can't pass.

## Examples

- Given Acme, trusted, whose connector `files` runs `node server.js`,
  when an attacker adds `NODE_OPTIONS=--require ./x.js` to its variables,
  then reading its tool listing starts no program and fails with exit code 3, and `halonic run support-reply` exits with 3, its last stdout line matches `^hfp1:[0-9a-f]{64}$`, and the run log holds no run.
- Given Acme, trusted, whose connector `files` reaches `https://mcp.acme.test/v1/mcp`,
  when an attacker swaps the host for a look-alike,
  then no server is reached and the run exits with 3.
- Given Acme, trusted,
  when its connectors are written again in another order,
  then each connector's program starts or its server is reached, and the run ends with exit code 0 and one run in the log.
