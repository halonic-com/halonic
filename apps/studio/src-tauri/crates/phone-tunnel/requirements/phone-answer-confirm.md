# studio.src-tauri.crates.phone-tunnel.phone-answer-confirm

- Status: draft
- Since: unreleased
- Source: HAL-19028; board option P3 on HAL-17509 ("the same check for every Inbox answer from the phone, at most once every 5 minutes"); HAL-17511; the owner check of HAL-15194 and Julian's conditions on HAL-15212

When the page sends a `msg-answer`, the phone shall ask the owner check first, unless the owner check passed for an earlier `msg-answer` less than 5 minutes ago, counted from that pass, and the app hasn't left the screen since. For a `msg-answer` the owner check shall accept a strong (Class 3) biometric or the phone's PIN, pattern or password. The phone shall keep that pass in memory only, and shall forget it when the app goes to the background, the screen turns off or locks, the app stops, or the phone can't tell whether the app left the screen. When the page sends an `answer-approval`, the phone shall ask the owner check every time, for a strong biometric only; no pass shall cover it, and a pass for an `answer-approval` shall cover no `msg-answer`. If the owner check is asked and doesn't pass, then the phone shall send nothing (`not-confirmed`) and keep no pass.

## Examples

- Given the owner passed the check for an Inbox answer,
  when they send another one 4 minutes 59 seconds later,
  then it goes out without a prompt.
- Given the owner passed the check for an Inbox answer,
  when they send another one 5 minutes 1 second later,
  then a new prompt shows first.
- Given the owner passed the check for an Inbox answer a minute ago,
  when they approve a risky approval,
  then a new prompt shows, and it takes a fingerprint or a strong face unlock, not the PIN.
- Given the owner passed the check for an Inbox answer, then switched to another app and back,
  when they send another Inbox answer,
  then a new prompt shows first.
- Given a phone with a PIN and no strong biometric,
  when the owner sends an Inbox answer,
  then the prompt takes the PIN, and the answer goes out after it.
- Given a prompt for an Inbox answer,
  when the owner cancels it,
  then nothing is sent (`not-confirmed`), and the next Inbox answer shows a prompt again.
