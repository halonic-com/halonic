# remote.phone-stale-banner

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, section 3; strings table on HAL-12233, `s-m3`, `s-m8`, `phone.stale.*`, G17 and G24; flow check C672 on HAL-16097)

While the phone can't reach its computer, a banner over the agents shall say why in its title: "{computer} isn't answering", "Your phone is offline", "Tailscale is off on this phone" or "Nearby devices isn't allowed for Halonic". Under it the banner shall say "What you see is as of {asOf}. If your computer is on, your agents there keep running.", leaving out the first sentence when nothing has arrived since the app started. It shall offer Details, named "Connection details", which opens the same sheet as the header label, and Try again, which is busy while a try is under way. The banner is not a live region: the header's live region says the state.

## Examples

- Given Tim's laptop doesn't answer and the last update came at 14:02 today,
  when the banner shows,
  then it reads "Tim's laptop isn't answering" and "What you see is as of 14:02. If your computer is on, your agents there keep running.".
- Given the phone's own Tailscale is off and nothing has arrived since the app started,
  when the banner shows,
  then it reads "Tailscale is off on this phone" and only "If your computer is on, your agents there keep running.".
- Given the banner shows,
  when the person taps Details,
  then the connection's detail sheet opens.
