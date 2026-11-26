# kit.time-stamp

- Status: active
- Since: unreleased
- Source: HAL-19537; HAL-19536 item 4 (short timestamps); design check HAL-19540; HAL-19825

The kit's `shortTime(at, now, locale)` shall be the one way Studio says when something happened at the end of a list row, as the Messenger's chats, the Routines runs and a workflow's Runs view say it (rows under a day heading, such as Runs' and Source control's, keep the time of day, and a time inside a sentence keeps its own words): the time of day when `at` is on the same calendar day as `now` ("09:41"), "Yesterday" on the calendar day before, the short weekday from 2 to 6 calendar days before ("Mon"), the day and short month earlier in the same year ("26 Nov"), and the short numeric date before that year ("26/11/2025"). Each part shall be in English, the language of the Studio's words, written as `locale`'s region writes English (the runtime's own when none is given), so one line never mixes languages: en-US shows "9:41 AM" and "Nov 26", de-DE shows "09:41", "Mon" and "26 Nov"; a region Intl has no English for shall read as `en-GB`. The kit's `fullTime(at, locale)` shall give the full date and time by the same rule. The kit's `TimeStamp` shall render the short time in a `<time>` element with the moment in `dateTime` and the full date and time as its hover title, in `text-small` `fg-muted` with tabular figures, and shall never wrap or shrink, so the name beside it is cut first; for an invalid `at` it shall render nothing. Without a `locale` of its own, `TimeStamp` shall follow the window's `FormatLocaleProvider`, which Studio's window and the Inbox's and Messenger's windows set from the format chosen in Settings → Formats, else from the system's region format (the browser's language when served), as "Follow this computer" does, and set again at once when the choice changes; `followedFormat(chosen, region)` shall give that tag, and `formatTag` shall turn a system tag such as `en_GB.UTF-8` into `en-GB`, and a tag Intl can't read into none, so the runtime's own format is used.

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
- Given a `TimeStamp` whose `at` is an invalid date,
  when it renders,
  then it renders nothing and doesn't throw.
- Given a `TimeStamp` without a locale inside a window whose region format is `en_US.UTF-8`,
  when it renders 09:41 today,
  then it shows "9:41 AM".
- Given a Studio window without a region format, in a browser whose language is `en-US`,
  when a `TimeStamp` without a locale inside it renders 09:41 today,
  then it shows "9:41 AM".
- Given the Messenger's focused window, in a browser whose language is `en-US`, on a computer whose region format is `en_GB.UTF-8`,
  when a `TimeStamp` without a locale inside it renders 09:41 today,
  then it shows "09:41".
- Given now is Thu 26 Nov 2026 09:41 and the locale `de-DE`,
  when `at` is 09:41 that day, Mon 23 Nov 2026, or 26 Nov 2026 seen from 5 Dec 2026,
  then `shortTime` gives "09:41", "Mon" and "26 Nov", never "Mo." or "26. Nov.".
- Given the locale `pt-BR`, a region Intl has no English for,
  when `at` is 09:41 today,
  then `shortTime` gives "09:41", as `en-GB` does.
- Given now is Mon 30 Mar 2026 10:00 in Amsterdam, the day after the clocks went forward,
  when `at` is Sat 28 Mar 2026 12:00,
  then `shortTime` gives "Sat", not "Yesterday".
- Given a window on a computer whose region format is `en_GB.UTF-8`, where Settings → Formats is set to English (US),
  when a `TimeStamp` without a locale inside it renders 09:41 today,
  then it shows "9:41 AM"; once Formats follows the computer again, it shows "09:41".
