# integration-runner.frames

- Status: active
- Since: 0.1.0
- Source: HAL-4281 (HAL-983, design HAL-958 section 3.1)

The integration runner's bridge shall carry one JSON frame per line on the runner's stdin and stdout, read and write no frame longer than 1 MiB including its newline, refuse a line that is too long before its end arrives, and refuse a line that is not UTF-8, not JSON, or cut off by the end of the stream.

## Examples

- Given a line one byte over 1 MiB that has no newline yet,
  when it is read,
  then the reader refuses it as too large without waiting for the rest.
- Given a line with bytes that aren't UTF-8,
  when it is read,
  then the reader refuses it as not UTF-8.
- Given a frame that would be longer than 1 MiB,
  when it is written,
  then the writer refuses it and writes nothing.
- Given frames split across pieces of the stream in any way,
  when they are read,
  then each frame comes out whole and in order.
