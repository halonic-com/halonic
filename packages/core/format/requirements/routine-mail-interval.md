# format.routine-mail-interval

- Status: active
- Since: 0.1.0
- Source: HAL-113, the known `15m` bug (plan 9.3 point 4); old pattern `/^[1-9]d*(m|h|d)$/` in 784f78d `packages/core/schema/src/index.ts`

If a mail trigger's `every` is a whole number of one or more digits followed by `m`, `h` or `d`, then the format shall accept it. The old pattern missed a backslash and refused every interval of two or more digits, such as `15m`. This is an allowed difference from the old repo.

## Examples

- Given `every: 15m`, when the routine is parsed, then it passes (the old code refused it).
- Given no `every`, when it is parsed, then the interval is `2m`.
- Given `every: 0m`, `15s` or `1dd`, when it is parsed, then it fails with `invalid_format` at `trigger.mail.every`.
