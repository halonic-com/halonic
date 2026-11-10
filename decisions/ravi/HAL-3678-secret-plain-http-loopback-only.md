# Decision: a secret goes over plain `http` only to this machine, optional or not

- Requirement: `integration-kit.local-http-hosts` (`packages/adapters/integration-kit/requirements/local-http-hosts.md`), unchanged
- Task: HAL-3678, a follow-up from Liam's review of integrations#164 (HAL-3675)
- Approval: the maintainer approves this note in review

## What changes

`integrationPolicy` let an `optional: true` secret list a `private` host over plain `http`, on
the idea that without a key the request goes out bare and with one the kit refuses it. The kit
doesn't work that way: `checkPlacementHosts` runs before `readSecrets`, so every request that
names the secret over plain `http` to a private address is refused as `secret-over-plain-http`,
whether the workspace has set the key up or not. The exception only put a host on the
permission sheet's secret that the kit would never send it to.

Now `integrationPolicy` refuses it as `secret-over-plain-http` for every secret, as the ADR
(`docs/adr/2026-11-08-integration-interface.md`), the kit's requirement and both integration
guides already say: a secret goes over plain `http` only to this machine. An integration for a
server on the home network that may need a key uses `https`, or leaves the secret out.

## Tests

The test "allows plain http to a private network, but a secret only when it's optional" asserted
the exception, so it is replaced by one that refuses the secret with `optional` false and true,
plus one that takes the secret to a private address over `https`. Two tests that read a URL's
host (`reads the host of …`, `takes a … setting only inside its class`) now use a sheet without
a secret, since a plain `http` private URL is refused through the secret before its host is
read. Every URL they check is unchanged.
