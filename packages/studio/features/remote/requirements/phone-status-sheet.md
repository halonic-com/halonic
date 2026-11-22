# remote.phone-status-sheet

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, section 3 and decision 17; strings table on HAL-12233, `s-m4`, `s-m5`, `s-m6`, `s-m8`, "Agents as of", G14, G15, G17 and G24; flow check C672 on HAL-16097)

The phone's header label shall open a detail sheet titled with what the phone knows of its own side. Connected shall name the computer, the route ("through Tailscale" or "through this Wi-Fi") and the last update, with a row that opens Paired computers. Reconnecting shall say when it tries again in whole seconds, or "Trying now…" while a try is under way, say what time what the person sees is as of and that it may be out of date, and offer Try now. "{computer} isn't answering" (the header label's and the banner's words), "Your phone is offline", "Tailscale is off on this phone" and "Nearby devices isn't allowed for Halonic" shall each show two halves: a Your phone card saying why the phone can't reach the computer, and a Your agents card with what the agents were last doing and its time. Then comes one check line, about the computer only when the phone is online, and for a computer reached through this Wi-Fi asking that both are on the same Wi-Fi rather than that Tailscale is on there, and one button: Try again, or Open Tailscale or Open settings for the phone's own cause. Before anything has arrived since the app started, the sheet shall say no last update and show no Your agents card.

## Examples

- Given the phone is online and Tim's laptop doesn't answer, with 1 agent running and 1 waiting as of 14:02,
  when the person opens the label's sheet,
  then it reads "Tim's laptop isn't answering", the check line says "Check that Tim's laptop is on and awake, Halonic is open, and Tailscale is on there.", the Your phone card says "It is online, but Tim's laptop doesn't answer, so it can't show new work or take your answers.", the "Your agents · as of 14:02" card says "1 running, 1 waiting for you. If your computer is on, they keep running. Anything that needs you waits.", and Try again connects at once.
- Given Tim's laptop is reached through this Wi-Fi and doesn't answer,
  when the sheet shows,
  then its check line says "Check that Tim's laptop is on and awake, Halonic is open, and both are on the same Wi-Fi."
- Given the phone is reconnecting with the next try in 7.2 seconds, and the last update came at 14:02,
  when the sheet shows,
  then it reads "Looking for Tim's laptop. Trying again in 8 seconds." and "What you see is as of 14:02 and may be out of date until it reconnects."; and once that time has passed, "Looking for Tim's laptop. Trying now…".
- Given the phone is connected to Tim's laptop through Tailscale and the last update came at 14:05,
  when the sheet shows,
  then it reads "Tim's laptop, through Tailscale. Last update 14:05." with a Paired computers row.
- Given the phone's own Tailscale is off,
  when the sheet shows,
  then its title is "Tailscale is off on this phone", its button is Open Tailscale, and it never asks to check the computer.
