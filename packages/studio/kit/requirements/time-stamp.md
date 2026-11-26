# kit.time-stamp

- Status: draft
- Since: unreleased
- Source: HAL-19537; HAL-19536 item 4 (short timestamps); design check HAL-19540

The kit's `shortTime(at, now, locale)` shall be the one way Studio says when something happened in a list: the time of day when `at` is on the same calendar day as `now` ("09:41"), "Yesterday" on the calendar day before, the short weekday from 2 to 6 calendar days before ("Mon"), the day and short month earlier in the same year ("26 Nov"), and the short numeric date before that year ("26/11/2025"). Each part shall follow `locale`, the runtime's own when none is given, so a 12-hour locale shows "9:41 AM" and a month-first locale "Nov 26". The kit's `fullTime(at, locale)` shall give the full date and time. The kit's `TimeStamp` shall render the short time in a `<time>` element with the moment in `dateTime` and the full date and time as its hover title, in `text-small` `fg-muted` with tabular figures, and shall never wrap or shrink, so the name beside it is cut first. Without a `locale` of its own, `TimeStamp` shall follow the window's `FormatLocale`, which the Studio window sets from the system's region format (the browser's language when served), as Settings → Formats' "Follow this computer" does; `formatTag` shall turn a system tag such as `en_GB.UTF-8` into `en-GB`, and a tag Intl can't read into none, so the runtime's own format is used.

## Examples

- Given now is Thu 26 Nov 2026 09:41 and the locale `en-GB`,
  when `at` is 00:00 that day,
  then `shortTime` gives "00:00"; at 23:59 the day before it gives "Yesterday".
- Given the same now,
  when `at` is Mon 23 Nov 2026 12:00,
  then `shortTime` gives "Mon"; for Thu 19 Nov 2026 it gives "19 Nov".
- Given now is Sat 2 Jan 2027 10:00 and the locale `en-GB`,
  when `at` is Wed 30 Dec 2026 18:00,
  then `shortTime` gives "Wed"; for 20 Dec 2026 it gives "20/12/2026".
- Given now is Thu 26 Nov 2026 09:41 and the locale `en-US`,
  when `at` is 09:41 that day,
  then `shortTime` gives "9:41 AM"; for 19 Nov 2026 it gives "Nov 19".
- Given a `TimeStamp` for 26 Nov 2026 09:41 with the locale `en-GB`,
  when it renders,
  then it shows "09:41" in a `<time>` whose title names Thursday 26 November 2026 at 09:41.
- Given a `TimeStamp` without a locale inside a window whose region format is `en_US.UTF-8`,
  when it renders 09:41 today,
  then it shows "9:41 AM".
