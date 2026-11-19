# remote.tunnel-reasons

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), "Words for the tunnel's reasons (computer)" and decisions 25 and 26

While remote is on and the tunnel is degraded or down, Settings › Remote shall show the tunnel's reason as an amber callout, worded as in the design's table: its title, its line and its actions. "Open Tailscale setup" and "How to turn Funnel off" shall open Tailscale's web pages outside Studio and say so, and "Check again" shall turn remote off and on again, so the tunnel looks again. A tunnel that is starting, ready or stopped shall show no callout. The Connection line shall name the state in a word: "Ready", "Starting…", "Not installed", "Signed out", "Offline", "Problem", "Funnel on" or "Off".

## Examples

- Given remote on through Tailscale, signed out,
  when the section shows,
  then the callout says "Tailscale is signed out" and "Phones can't reach this computer until you sign in to Tailscale on it again. Your agents keep running.", with only Check again, and the Connection line says "Signed out".
- Given the same callout,
  when the person presses Check again and Tailscale is signed in now,
  then the callout goes and the Connection line says "Ready".
- Given the reason `offline`,
  when it is worded,
  then the title is "This computer is offline" and there is no action.
- Given the reason `public-refused`,
  when it is worded,
  then the actions are "How to turn Funnel off", which opens Tailscale's page on turning Funnel off, and Check again.
