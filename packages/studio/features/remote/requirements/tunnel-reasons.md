# remote.tunnel-reasons

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), "Words for the tunnel's reasons (computer)"

While remote is on and the tunnel is degraded or down, Settings › Remote shall show the tunnel's reason as an amber callout, worded as in the design's table: its title, its line and its actions. "Open Tailscale setup" and "Open Tailscale" shall open Tailscale's pages outside Studio, and "Check again" shall turn remote off and on again, so the tunnel looks again. A tunnel that is starting, ready or stopped shall show no callout. The Connection line shall name the state in a word: "Ready", "Starting…", "Not installed", "Signed out", "Offline", "Problem", "Funnel on" or "Off".

## Examples

- Given remote on through Tailscale, signed out,
  when the section shows,
  then the callout says "Tailscale is signed out" and "Phones can't reach this computer until you sign in again. Your agents keep running.", with Open Tailscale and Check again, and the Connection line says "Signed out".
- Given the same callout,
  when the person presses Check again and Tailscale is signed in now,
  then the callout goes and the Connection line says "Ready".
- Given the reason `offline`,
  when it is worded,
  then the title is "This computer is offline" and there is no action.
