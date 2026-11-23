# remote.phone-connection-check

- Status: draft
- Since: unreleased
- Source: HAL-13413 (first-run-progress section 6, with the marks and report rules of 4.2 and 4.3, on HAL-7986, approved by the board on 19 Nov, HAL-7993)

Check this connection shall be a full sheet with Close that lists only what the phone can see: **Phone**, online with the way it reaches the computer ("Online, through Tailscale" or "Online, through this Wi-Fi"), offline with "Turn on Wi-Fi or mobile data. It reconnects by itself.", or not known yet while no try has finished; and **Your computer**, "{computer} answers.", "{computer} isn't answering." with the check for the way the phone reaches it, "Not checked until your phone is online." while the phone is offline, or "No answer yet.". Each line shall carry its mark as an icon and words (✓ works, ✕ problem, – info), and one cause shall count once, so an offline phone makes the computer's line info. Under the lines it shall say "Not checked here: Halonic's engine, models and sandbox. They need your computer first." It shall say "Checking the connection" while no try has finished, else the count of problems or "No problems found". Check again shall only connect. Once it knows, Copy report and Show the report shall offer a plain-text report built only from fixed words and the tunnel's kinds: "Check this connection", the time as `2026-11-22 10:42`, the count, one row per line with its glyph, its label padded to 16 characters and its facts, and "– Not checked     engine, models, sandbox · needs your computer first". The report shall never hold the computer's name, an address or an error's text.

## Examples

- Given the phone is online and Tim's laptop, reached through Tailscale, timed out,
  then the sheet reads "1 problem", "Online, through Tailscale" and "Tim's laptop isn't answering." with "Check that Tim's laptop is on and awake, Halonic is open, and Tailscale is on there.", and the report's rows are "✓ Phone           online · through Tailscale", "✕ Your computer   isn't answering · timed out" with "Fix: check that it is on and awake, Halonic is open, and Tailscale is on there." under it.
- Given the phone's network is down,
  then the Phone line is the one problem and the Your computer line reads "Not checked until your phone is online." as info.
- Given the first reach gave up after 30 seconds with no try finished,
  then the Your computer row reads "isn't answering · no answer in 30 seconds".
- Given Tim's laptop answers,
  then the sheet reads "No problems found".
- Given a computer named with an email address and a key-shaped string,
  then neither is in the report.
- Given no try has finished,
  then the sheet says "Checking the connection" and offers no report.
