# integration-runner.host-block

- Status: active
- Since: unreleased
- Source: HAL-19196 (plan on HAL-19188, PR 1)

When the kit refuses with `host-not-allowed` a request the integration's own code sent to a host its permission sheet doesn't list, the bridge shall report a `host-not-declared` block naming that host, once for that request. A redirect hop to such a host shall still be refused, but the bridge shall report no block for it, because the service chose that host, not the integration. Kit refusals on the leak list shall still be reported as `leak-attempt` blocks.

## Examples

- Given an integration whose own code fetches `https://undeclared.example.net/collect`,
  when the kit refuses it with `host-not-allowed`,
  then the bridge reports `{ kind: "host-not-declared", host: "undeclared.example.net" }` once and nothing reaches the network.
- Given a `GET` to a declared host that answers with a 302 to `undeclared.example.net`,
  when the kit refuses the redirect with `host-not-allowed`,
  then the integration gets that refusal and the bridge reports no block.
- Given a kit refusal with `secret-in-request`, `placement-not-in-sheet` or `secret-sign-in-only`,
  when the integration sends that request,
  then the bridge reports `{ kind: "leak-attempt" }` with that code.
