# coding-tools.read-ranges

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737, sections 5 and 6)

The `read_ranges` tool shall read 1 to 20 files in one call, each whole or from a `start` line to an `end` line, inclusive, and give each file's lines numbered from 1, under a header with the range and the file's line count. Without an `end` it shall give 400 lines and say which lines to ask for next. It shall cut a line after 500 characters, refuse a file over 8 MB or a binary file (one with a NUL byte in its first 8 KB), and refuse an argument it doesn't take. When the answer would pass 24,000 characters, it shall stop at a whole line and say which lines and files weren't sent. A refused file shall not stop the other files of the call.

Within one session, `read_ranges` shall remember which lines of each file it sent, with a digest of the file. When a file is asked for again and hasn't changed, it shall send only the lines not sent before and name the others as unchanged since the earlier read; when the file changed, or the call sets `fresh`, it shall send every line asked for. A line counts as sent only once it is in an answer.

## Examples

- Given a file of 1,000 lines,
  when the model reads it without a range,
  then it gets lines 1–400 of 1,000 and is told to ask for 401–800.
- Given lines 1–50 of an unchanged file were read before,
  when the model asks for lines 40–60,
  then it gets lines 51–60 and is told lines 40–50 are unchanged.
- Given the same request after the file changed,
  when the model asks again,
  then it gets lines 40–60 in full.
