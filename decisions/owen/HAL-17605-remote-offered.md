# Decision: the executable offers remote with the Tailscale provider where `tailscale` is installed

- Approval: HAL-17605, plan and decisions 1 and 2 approved by the maintainer on HAL-17607; merge waits for the phase 2 card, HAL-17544
- Kind: user-visible

## What changes

Until now the executable gave the host no tunnel provider, so every launch served remote as not
offered, and the two requirements said so ("until phase C"). Phase C's first provider is
Tailscale (`@halonicjs/adapter-tunnel-tailscale`, pull request 5675). The executable's entry
point (`runExecutable` in `host.ts`, which `main.ts` calls) now gives the host a probe. Once the
host serves, and only if it could offer remote (not over `--stdio`, with a profile folder and
its lock), the probe runs `tailscale status --json` once. It gives the Tailscale provider only
when a `tailscale` program answers. Without one the host is exactly as before: `available:
false`. A fresh profile keeps remote off, and pairing still needs Allow on the desktop.

With the provider, the gateway's listener accepts the node's tailnet name and serve port as
`Host`, read each time it starts, because `tailscale serve` passes the phone's `Host` on. It
refuses a request carrying `Tailscale-Funnel-Request`, the header Tailscale's serve proxy sets
on every request that came through Funnel (`remote-gateway.public-request`, pull request 5821).

## The requirement edits

- `agent-host.remote-gateway`: the sentence "the executable's entry point gives none until
  phase C … every launch the executable makes listens on no port for the gateway" becomes the
  Tailscale rule above. No launch argument or environment variable turns remote on, as before.
  Two examples are added. None is removed.
- `agent-host.remote-not-offered`: "which every launch the executable makes until phase C"
  becomes "as when the executable runs on a computer without `tailscale`". The two examples about
  a host the executable launched now say "on a computer without `tailscale`".

No test or golden file is weakened or removed. The tests that start `run` without a provider
still pass unchanged; one test title now names the case it covers ("as the executable where
tailscale isn't installed").

## Covers

- agent-host.remote-gateway
- agent-host.remote-not-offered
