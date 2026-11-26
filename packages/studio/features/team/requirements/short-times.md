# team.short-times

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3 (short times in Team's PR rows, HAL-19536 item 4); built on HAL-19765

The Pull requests screen shall write the time a PR entered its state with the kit's short time, in the window's time format and the screen's time zone: the time for today, and "yesterday" in lower case after a word.

## Examples

- Given a PR merged at 12:40 today, in the en-US format,
  when the Merged today list shows,
  then its row reads "Merged 12:40 PM".
- Given a PR merged at 18:05 yesterday,
  when the Merged today list shows,
  then its row reads "Merged yesterday".
