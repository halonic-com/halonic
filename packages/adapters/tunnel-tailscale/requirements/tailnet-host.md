# tunnel-tailscale.tailnet-host

- Status: active
- Since: unreleased
- Source: task HAL-17605 (phase 2 G0): the agent host offers remote only where `tailscale` is installed (decision 1 on HAL-17607), and its gateway accepts the `Host` a request through the tunnel carries

The Tailscale tunnel provider shall say whether a `tailscale` program is there to run, by running `tailscale status --json`: a program that answers, with any exit code, is installed, and a missing program or a call that hung or couldn't run is not. It shall give the `Host` a phone's request carries through the tunnel, read from the node's state: the node's tailnet name with its serve port, and on port 443 also the name alone; and no name when the node isn't signed in, running and online, or its state can't be read. It shall give the name of the header Tailscale's serve proxy sets on a request that came through Funnel, `Tailscale-Funnel-Request`. On `stop`, it shall remove its serve entry only while the serve config still sends its `host:port` to the gateway address it added, leave an entry the person put there since, and remove nothing, saying why, when the serve config can't be read.

## Examples

- Given a node that is signed out,
  when the host asks whether Tailscale is installed,
  then the answer is yes.
- Given no `tailscale` program,
  when the host asks whether Tailscale is installed,
  then the answer is no.
- Given a node that is signed in and online, serving on 8443,
  when the host asks for the tunnel's `Host`,
  then the answer is `<node>.ts.net:8443`.
- Given a tunnel that is up, and the person who then pointed its port at another address,
  when the tunnel stops,
  then it runs no `serve … off`, and the person's entry stays.
