# tunnel-tailscale.provider

- Status: active
- Since: unreleased
- Source: tunnel phase C of the plan "phone reaches a runtime host through pluggable tunnels"; plan approved by the maintainer on HAL-17607 for task HAL-17605

The Tailscale tunnel provider shall implement the `TunnelProvider` port (`ports.tunnel-provider`) and pass the `contracts.tunnel-provider` suite. It shall run only the `tailscale` command, found on `PATH` (absolute folders only) or at a given path, with an argument list and no shell, only the `PATH`, `HOME`, `USERPROFILE`, `SystemRoot` and locale variables, a time limit (10 seconds by default) and an output limit; a call past either limit shall be killed and leave the tunnel `down` with reason `provider-error`. It shall build only `status` and `serve` commands, and never `funnel`, a sign-in or a serve reset, and no argument shall carry a key. It shall report `public: false` and `encryptsPath: true`, and serve the gateway over HTTPS on the tailnet on its serve port (8443 by default), giving a `wss:` endpoint at the node's tailnet name. Before adding its serve entry it shall read the node's state and the serve config: no `tailscale` program shall be `not-installed`, a node that needs a sign-in `signed-out`, a node that isn't running or online `offline`, Funnel already on for its port `public-refused`, and any other entry on its port `provider-error`, left unchanged. On `stop`, and when a stop comes while it is adding its entry, it shall remove only the serve entry it added itself.

## Examples

- Given a node that is signed in and online, with nothing served on 8443,
  when the tunnel starts for the gateway on `127.0.0.1:4100`,
  then it runs `serve --bg --https=8443 http://127.0.0.1:4100` and gives `wss://<node>.<tailnet>.ts.net:8443`.
- Given Funnel already on for the node's port 8443,
  when the tunnel starts,
  then it is `down` with reason `public-refused`, and no `serve` entry is added.
- Given a serve entry of the person's own on port 8443,
  when the tunnel starts,
  then it is `down` with reason `provider-error`, and that entry is left as it is.
- Given a node that needs a sign-in,
  when the tunnel starts,
  then it is `down` with reason `signed-out`, and nothing signs in.
- Given no `tailscale` program,
  when the tunnel starts,
  then it is `down` with reason `not-installed`.
- Given a `tailscale` that never answers,
  when the tunnel starts,
  then the call is killed at its time limit and the tunnel is `down` with reason `provider-error`.
- Given a tunnel that is up,
  when it stops,
  then it runs only `serve --https=8443 off`, never `serve reset`.
