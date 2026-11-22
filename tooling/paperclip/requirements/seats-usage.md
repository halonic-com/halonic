# paperclip.seats-usage

- Status: active
- Since: unreleased
- Source: HAL-16008; the `seats` plugin in the supervision plugins plan on HAL-15997 (phase 3), read through the Claude CLI as the spike on HAL-16005 recommends

When the `seats` plugin reads a seat's `/usage` text, it shall turn each `Current session` and `Current week (…)` line into a window with its kind (session, week, or week for one model), its whole percent used and its reset as a UTC time, read in the time zone the line names, and it shall report the reading as unreadable, rather than empty, when no such line is in the text.

## Examples

- Given the line `Current session: 23% used · resets Nov 22, 3pm (UTC)` read on 22 Nov 2026,
  when it is read,
  then it is a session window at 23% that resets at `2026-11-22T15:00:00.000Z`.
- Given `resets Nov 25, 9:30am (Europe/Amsterdam)`,
  when it is read on 22 Nov 2026,
  then the reset is `2026-11-25T08:30:00.000Z`.
- Given `resets 2am (UTC)` read at 23:00 UTC,
  when it is read,
  then the reset is 2:00 the next day.
- Given a time zone name Claude Code can't have printed,
  when it is read,
  then the percentage still counts and the reset is left unread, with its text kept.
- Given text with no usage line,
  when it is read,
  then the reading is unreadable.
