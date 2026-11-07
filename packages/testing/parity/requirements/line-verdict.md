# parity.line-verdict

- Status: active
- Since: 0.1.0
- Source: HAL-108 (task point 3: where the old code gives no line or a wrong one)

When a case says where its fault is, the recorder shall compare that line with the first error or warning the old loader gave for that file, and record the verdict: "same", "different", "no-line" (the old code gives none) or "no-error" (the old code reports nothing on that file).

The recorder shall mark each recorded file "pass", "fail" or "not-read" (the old loader skipped it).

## Examples

- Given a fault on line 7 and an old error on line 7, then the verdict is "same".
- Given a fault on line 7 and an old error on line 2, then the verdict is "different".
- Given a fault on line 7 and an old error without a line, then the verdict is "no-line".
- Given a fault on line 7 and only an info message on the file, then the verdict is "no-error".
- Given a missing file (line null) and an old error without a line, then the verdict is "same".
