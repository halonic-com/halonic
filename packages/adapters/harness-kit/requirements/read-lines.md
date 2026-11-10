# harness-kit.read-lines

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3 and D2; HAL-3587

The harness kit shall read a program's output as UTF-8 text, one line at a time. A line shall end with `\n` or `\r\n`, and neither shall be part of the line. The last line shall be read even without a line break, and there shall be no empty line after the final break. A character split across two chunks shall be put back together. A line longer than the given limit shall end the reading with an error that doesn't quote it. When the reading stops early, the stream shall be cancelled.

## Examples

- Given the chunks `{"a":` and `1}\r\nlast`,
  when they are read,
  then the lines are `{"a":1}` and `last`.
- Given a limit of 20 characters and a line of 150,
  when it is read,
  then the reading ends with an error that says the line is longer than 20 characters and doesn't contain it.
