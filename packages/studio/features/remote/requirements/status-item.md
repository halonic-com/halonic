# remote.status-item

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), decision 2, the screens "The computer's status bar item, six states" and "In place, with a phone connected", and "Accessibility and motion"

While the host offers remote, the Studio window's status bar shall show the Remote item in one of six states: "Remote off" with no dot while remote is off; "Starting remote…" with an attention dot while the tunnel starts; "Remote needs attention" with an attention dot while the tunnel is degraded or down; and, while the tunnel is ready, "Remote on · no phone" with a ring while no phone is connected, "Pixel 8 connected" with a success dot while one phone is, and "2 phones connected" while several are. The item shall show state only: it shall not pop anything up or be a live region, and the words, not the dot, shall carry the state. When the person presses the item, Studio shall open Settings › Remote. While the host doesn't offer remote, or no host gives Studio a `RemoteControl`, there shall be no item.

## Examples

- Given remote on with Pixel 8 connected,
  when the status bar shows,
  then the item says "Pixel 8 connected" with a success dot.
- Given remote on and Tailscale signed out,
  when the status bar shows,
  then the item says "Remote needs attention", and a press opens Settings › Remote, which says why.
- Given a host that doesn't offer remote,
  when the status bar shows,
  then there is no Remote item.
