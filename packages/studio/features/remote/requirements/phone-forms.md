# remote.phone-forms

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel strings table on HAL-12233, "Plural and time forms", G15)

When the phone's tunnel screens show a count or a time, the page shall write it in the strings table's forms: a 24-hour time ("14:02"); a day and short month, with the year only when it isn't this year ("14 Nov", "3 Nov 2025"); "as of" a time today, "yesterday" and a time, or a day and a time; tries left as "4 tries left" or "1 try left"; the wait before a reconnect try in whole seconds rounded up, never under 1 ("1 second", "8 seconds"); and the agents as of the last update with a zero part left out ("2 running", "1 waiting for you"), or "Nothing was running or waiting for you." when both are zero. In a screen-reader name the page shall read a visible " · " as a comma, and a code character by character.

## Examples

- Given a last update at 14:02 today,
  when the phone writes `{asOf}`,
  then it writes "14:02"; at 14:02 yesterday, "yesterday 14:02"; on 14 Nov of an earlier day this year, "14 Nov 14:02".
- Given 1 try left,
  when the phone writes `{triesLeft}`,
  then it writes "1 try left".
- Given the next reconnect try in 500 ms,
  when the phone writes `{seconds}`,
  then it writes "1 second".
- Given 0 running and 3 waiting,
  when the phone writes the agents line,
  then it says "3 waiting for you. Anything that needs you waits.".
- Given the check code "4F7 · 2KQ",
  when the phone names it for a screen reader,
  then the name is "4, F, 7, 2, K, Q".
