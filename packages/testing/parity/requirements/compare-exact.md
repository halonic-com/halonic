# parity.compare-exact

- Status: active
- Since: 0.1.0
- Source: HAL-117 (plan 9.3 point 7, phase 1 done-check in plan section 15)

When the compare reads a fixture file the old loader read, it shall compare the old and the new result exactly: pass or fail, and each error's key path, code, line and column, in order. A YAML syntax error has the code `syntax` and the path `[]` on both sides. Warnings are left out; a new result that isn't ok fails, even with only warnings. The old loader's errors between files (unknown references, workflow rules) shall be kept with the file, so a report can count them, and the file's own result shall still be compared.

## Examples

- Given an old issue at `name`, `invalid_type`, line 2, column 7, and the same from the new code, then the file is the same.
- Given the same issue, but on line 3 in the new code, then the file differs.
- Given an old issue without a line and a new one with line 2, then the file differs.
- Given an old file that failed only because of an unknown agent, and a new result that passes, then the file is the same and keeps the old loader's error.
- Given a new result that isn't ok but holds only warnings, then the file fails.
- Given a file whose YAML didn't parse, then the old side is the loader's YAML error at its line and column, with the code `syntax`.
